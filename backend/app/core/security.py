import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(
    subject: str, role: str, expire_minutes: int | None = None, extra_claims: dict | None = None
) -> str:
    minutes = settings.jwt_expire_minutes if expire_minutes is None else expire_minutes
    expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    payload = {"sub": subject, "role": role, "exp": expire, **(extra_claims or {})}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_grade_share_token(grade_id: uuid.UUID, published_at: datetime) -> str:
    """The results-sharing link's credential — deterministic given
    (grade_id, published_at), so the exact same token is reproduced every
    time (e.g. an instructor reopening the grade page later), without
    storing it anywhere. Republishing a grade changes published_at, which
    naturally invalidates any link shared from a prior publish."""
    expire = published_at + timedelta(days=3650)
    payload = {"sub": str(grade_id), "role": "grade_share", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
