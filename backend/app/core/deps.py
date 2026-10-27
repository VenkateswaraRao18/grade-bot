import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.exam_attempt import ExamAttempt
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None or "sub" not in payload:
        raise credentials_error

    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None:
        raise credentials_error
    return user


def require_role(*allowed_roles: UserRole):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return dependency


# --- Passcode-link flow (CLAUDE.md pivot): no student accounts, so the rest
# of a public exam session is authenticated by short-lived, purpose-scoped
# JWTs instead of a user row — same create_access_token/decode_access_token
# machinery as login, just a different `role` claim and no `sub` pointing at
# a `users` row. ---


def _decode_role_token(token: str, expected_role: str, error_detail: str) -> dict:
    payload = decode_access_token(token)
    if payload is None or payload.get("role") != expected_role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error_detail,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_entry_claims(token: str = Depends(oauth2_scheme)) -> dict:
    """Proves the passcode was already checked (POST /public/exams/{link_token}/enter)
    — `sub` is the exam_id. Required before the ID-photo step."""
    return _decode_role_token(token, "exam_entry", "Invalid or expired entry token — re-enter the passcode")


def get_verified_claims(token: str = Depends(oauth2_scheme)) -> dict:
    """Proves the ID photo matched a tagged submission (POST /public/verify-id)
    — `sub` is the exam_id, plus candidate_id_number/candidate_name claims.
    Required to actually start the exam (create the ExamAttempt)."""
    return _decode_role_token(token, "exam_verified", "Invalid or expired verification token — verify your ID again")


def get_voice_caller(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User | ExamAttempt:
    """Gate for /voice/* — both a logged-in user (instructor, or a student
    on the legacy login path) and a live passcode-flow exam attempt need
    text-to-speech/transcription during a session, and neither endpoint
    actually uses the identity for anything beyond "is this a real,
    currently-valid session" (see routers/voice.py)."""
    payload = decode_access_token(token)
    if payload is None or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if payload.get("role") == "exam_session":
        attempt = db.get(ExamAttempt, uuid.UUID(payload["sub"]))
        if attempt is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired exam session",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return attempt
    if payload.get("role") in (UserRole.student.value, UserRole.instructor.value):
        user = db.get(User, uuid.UUID(payload["sub"]))
        if user is not None:
            return user
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_attempt(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> ExamAttempt:
    """The live-exam bearer token (POST /public/start) — `sub` is the
    attempt_id itself, so possessing a valid token for one attempt can never
    reach another student's attempt."""
    payload = _decode_role_token(token, "exam_session", "Invalid or expired exam session")
    attempt = db.get(ExamAttempt, uuid.UUID(payload["sub"]))
    if attempt is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired exam session",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return attempt
