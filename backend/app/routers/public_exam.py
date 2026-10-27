import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from PIL import Image
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_entry_claims, get_verified_claims
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import AttemptStatus, ExamAttempt
from app.models.exam_link import ExamLink
from app.models.submission import ExamSubmission
from app.schemas.public_exam import EnterExamIn, PublicExamEntryOut, PublicStartOut, PublicVerifyIdOut
from app.services.ocr_service import extract_text, id_number_found_in_text

router = APIRouter(prefix="/public", tags=["public-exam"])

ENTRY_TOKEN_MINUTES = 30
VERIFIED_TOKEN_MINUTES = 15
SESSION_TOKEN_BUFFER_MINUTES = 20

ID_PHOTO_ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png"}
ID_PHOTO_MAX_BYTES = 8 * 1024 * 1024


@router.post("/exams/{link_token}/enter", response_model=PublicExamEntryOut)
def enter_exam(link_token: str, payload: EnterExamIn, db: Session = Depends(get_db)):
    """First step of the passcode flow — no auth yet, just the link token
    from the URL plus the passcode the instructor shared. Deliberately
    generic errors (never "wrong passcode" vs "unknown link") so this can't
    be used to probe for valid link tokens."""
    link = db.query(ExamLink).filter(ExamLink.link_token == link_token).first()
    if link is None or not verify_password(payload.passcode, link.passcode_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid link or passcode")

    exam = db.get(Exam, link.exam_id)
    if exam is None or exam.status != ExamStatus.published:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This exam is not currently available")

    entry_token = create_access_token(subject=str(exam.id), role="exam_entry", expire_minutes=ENTRY_TOKEN_MINUTES)
    return PublicExamEntryOut(
        entry_token=entry_token,
        exam_name=exam.name,
        duration_minutes=exam.duration_minutes,
        difficulty=exam.difficulty,
        thinking_time_seconds=exam.thinking_time_seconds,
        rubric=exam.rubric,
    )


def _find_matching_student_id(db: Session, exam_id: uuid.UUID, ocr_text: str) -> str | None:
    """Looks for exactly one instructor-tagged student_id_number (among this
    exam's bulk-uploaded submissions) that appears in the OCR'd ID photo
    text. More than one match is treated the same as no match — an
    ambiguous photo shouldn't guess which student it belongs to."""
    tagged_ids = {
        row[0]
        for row in db.query(ExamSubmission.student_id_number)
        .filter(
            ExamSubmission.exam_id == exam_id,
            ExamSubmission.student_id_number.isnot(None),
        )
        .distinct()
        .all()
    }
    matches = [sid for sid in tagged_ids if id_number_found_in_text(sid, ocr_text)]
    return matches[0] if len(matches) == 1 else None


@router.post("/verify-id", response_model=PublicVerifyIdOut)
def verify_id_public(
    candidate_name: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    claims: dict = Depends(get_entry_claims),
):
    """Second step — proves who the candidate is by matching their photographed
    ID against the instructor's bulk-tagged submissions, not against a user
    account (there isn't one). Never creates any DB row; a non-match just
    returns matched=False so the student can retake the photo."""
    exam_id = uuid.UUID(claims["sub"])
    exam = db.get(Exam, exam_id)
    if exam is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    if not candidate_name.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")

    if file.content_type not in ID_PHOTO_ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a JPEG or PNG image")
    contents = file.file.read()
    if len(contents) > ID_PHOTO_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 8MB)")

    storage_dir = Path(settings.id_photo_storage_dir)
    storage_dir.mkdir(parents=True, exist_ok=True)
    extension = ".jpg" if file.content_type == "image/jpeg" else ".png"
    dest_path = storage_dir / f"{uuid.uuid4()}{extension}"
    dest_path.write_bytes(contents)

    try:
        with Image.open(dest_path) as image:
            ocr_text = extract_text(image)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read image file") from exc

    matched_id = _find_matching_student_id(db, exam.id, ocr_text)

    if matched_id is None:
        return PublicVerifyIdOut(matched=False, verified_token=None, extracted_text=ocr_text.strip())

    already_completed = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.exam_id == exam.id,
            ExamAttempt.candidate_id_number == matched_id,
            ExamAttempt.status == AttemptStatus.completed,
        )
        .first()
        is not None
    )
    if already_completed:
        return PublicVerifyIdOut(
            matched=True, verified_token=None, extracted_text=ocr_text.strip(), already_completed=True
        )

    verified_token = create_access_token(
        subject=str(exam.id),
        role="exam_verified",
        expire_minutes=VERIFIED_TOKEN_MINUTES,
        extra_claims={"candidate_id_number": matched_id, "candidate_name": candidate_name.strip()[:200]},
    )
    return PublicVerifyIdOut(matched=True, verified_token=verified_token, extracted_text=ocr_text.strip())


@router.post("/start", response_model=PublicStartOut, status_code=status.HTTP_201_CREATED)
def start_public_attempt(db: Session = Depends(get_db), claims: dict = Depends(get_verified_claims)):
    """Third step — the real equivalent of the old start_attempt endpoint:
    this is where server_start_time is actually set (CLAUDE.md §6), never
    earlier. Resumes an in-progress attempt for this candidate+exam if one
    already exists (e.g. a refreshed tab), and blocks a second attempt once
    one has been completed — same one-attempt-per-student rule as before,
    just keyed on candidate_id_number instead of a user id."""
    exam_id = uuid.UUID(claims["sub"])
    candidate_id_number = claims["candidate_id_number"]
    candidate_name = claims.get("candidate_name")

    exam = db.get(Exam, exam_id)
    if exam is None or exam.status != ExamStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")

    session_minutes = exam.duration_minutes + SESSION_TOKEN_BUFFER_MINUTES

    existing_in_progress = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.candidate_id_number == candidate_id_number,
            ExamAttempt.status == AttemptStatus.in_progress,
        )
        .first()
    )
    if existing_in_progress is not None:
        session_token = create_access_token(
            subject=str(existing_in_progress.id), role="exam_session", expire_minutes=session_minutes
        )
        return PublicStartOut(
            attempt_id=existing_in_progress.id,
            session_token=session_token,
            status=existing_in_progress.status.value,
            server_start_time=existing_in_progress.server_start_time,
            duration_minutes=exam.duration_minutes,
        )

    already_completed = (
        db.query(ExamAttempt)
        .filter(
            ExamAttempt.exam_id == exam_id,
            ExamAttempt.candidate_id_number == candidate_id_number,
            ExamAttempt.status == AttemptStatus.completed,
        )
        .first()
    )
    if already_completed is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You have already taken this exam.")

    attempt = ExamAttempt(exam_id=exam_id, candidate_id_number=candidate_id_number, candidate_name=candidate_name)
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    session_token = create_access_token(subject=str(attempt.id), role="exam_session", expire_minutes=session_minutes)
    return PublicStartOut(
        attempt_id=attempt.id,
        session_token=session_token,
        status=attempt.status.value,
        server_start_time=attempt.server_start_time,
        duration_minutes=exam.duration_minutes,
    )
