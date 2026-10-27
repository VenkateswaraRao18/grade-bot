import logging
import tempfile
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.session import get_db
from app.models.exam import Exam, ExamStatus
from app.models.exam_attempt import ExamAttempt, Question, Response
from app.models.exam_link import ExamLink
from app.models.grade import AuditLog, Grade, GradingDetail, QuestionFeedback
from app.models.id_verification_photo import IdVerificationPhoto
from app.models.submission import ExamSubmission
from app.models.user import User, UserRole
from app.schemas.exam import ExamCreate, ExamOut, ExamRubricUpdate, ExamUpdate
from app.services.text_extraction import extract_text_from_material, resolve_upload_type
from app.services.vector_store import delete_submission_chunks

logger = logging.getLogger(__name__)
router = APIRouter(tags=["exams"])

MAX_ANSWER_SHEET_BYTES = 25 * 1024 * 1024


def get_owned_exam(exam_id: uuid.UUID, db: Session, current_user: User) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None or exam.instructor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found")
    return exam


def _extract_text_from_upload(file: UploadFile) -> str:
    """Shared by the standalone extract-text endpoint (used before an exam
    exists, e.g. on the New Exam form) and the per-exam instructor-answer
    upload. The file itself is never kept, only the extracted text."""
    resolved = resolve_upload_type(file.content_type, file.filename)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a PDF, Word document, Excel spreadsheet, CSV, or plain text file",
        )
    content_type, extension = resolved
    contents = file.file.read()
    if len(contents) > MAX_ANSWER_SHEET_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large (max 25MB)")

    with tempfile.NamedTemporaryFile(suffix=extension) as tmp:
        tmp.write(contents)
        tmp.flush()
        try:
            text = extract_text_from_material(tmp.name, content_type)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not read that file") from exc

    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No text could be extracted from that file"
        )
    return text.strip()


@router.post("/exams", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
def create_exam(
    payload: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam_kwargs = dict(
        instructor_id=current_user.id,
        name=payload.name,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        difficulty=payload.difficulty,
        min_questions=payload.min_questions,
        max_questions=payload.max_questions,
        adaptive_enabled=payload.adaptive_enabled,
        thinking_time_seconds=payload.thinking_time_seconds,
        sample_questions=payload.sample_questions,
        instructor_answer=payload.instructor_answer,
    )
    if payload.rubric:
        exam_kwargs["rubric"] = payload.rubric
    exam = Exam(**exam_kwargs)
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.get("/exams", response_model=list[ExamOut])
def list_exams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    return (
        db.query(Exam)
        .filter(Exam.instructor_id == current_user.id)
        .order_by(Exam.created_at.desc())
        .all()
    )


@router.get("/exams/{exam_id}", response_model=ExamOut)
def get_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    return get_owned_exam(exam_id, db, current_user)


@router.patch("/exams/{exam_id}/rubric", response_model=ExamOut)
def update_exam_rubric(
    exam_id: uuid.UUID,
    payload: ExamRubricUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam = get_owned_exam(exam_id, db, current_user)
    exam.rubric = payload.rubric
    db.commit()
    db.refresh(exam)
    return exam


@router.post("/exams/{exam_id}/instructor-answer/upload", response_model=ExamOut)
def upload_instructor_answer(
    exam_id: uuid.UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Extracts text from an uploaded answer-sheet document (PDF, Word,
    Excel, CSV, or plain text) and uses it as this exam's ground truth. The
    file itself isn't kept, only the extracted text — instructor_answer is
    injected directly into grading/question prompts rather than RAG-indexed,
    so there's nothing to index or store."""
    exam = get_owned_exam(exam_id, db, current_user)
    exam.instructor_answer = _extract_text_from_upload(file)
    db.commit()
    db.refresh(exam)
    return exam


@router.post("/exams/extract-text")
def extract_answer_text(
    file: UploadFile,
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Same extraction as the per-exam upload above, but with no exam_id —
    for the New Exam form, where there's no exam row yet to attach it to.
    The returned text just fills the answer-key field for the instructor to
    review/edit before the exam is created."""
    return {"text": _extract_text_from_upload(file)}


@router.patch("/exams/{exam_id}", response_model=ExamOut)
def update_exam(
    exam_id: uuid.UUID,
    payload: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Full exam edit — existing attempts/grades are untouched; this only
    affects the exam's own config and future question generation."""
    exam = get_owned_exam(exam_id, db, current_user)

    update_fields = payload.model_dump(exclude_unset=True)
    min_q = update_fields.get("min_questions", exam.min_questions)
    max_q = update_fields.get("max_questions", exam.max_questions)
    if max_q < min_q:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="max_questions must be >= min_questions")
    for field, value in update_fields.items():
        setattr(exam, field, value)

    db.commit()
    db.refresh(exam)
    return exam


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Cascades through everything that only has meaning attached to this
    exam — attempts/grades, the link, ID verification photos, and
    bulk-tagged student submissions (including their vector-store
    chunks)."""
    exam = get_owned_exam(exam_id, db, current_user)

    attempt_ids = [a.id for a in db.query(ExamAttempt.id).filter(ExamAttempt.exam_id == exam_id).all()]
    if attempt_ids:
        grade_ids = [g.id for g in db.query(Grade.id).filter(Grade.attempt_id.in_(attempt_ids)).all()]
        if grade_ids:
            db.query(AuditLog).filter(AuditLog.entity_type == "grade", AuditLog.entity_id.in_(grade_ids)).delete(
                synchronize_session=False
            )
            db.query(GradingDetail).filter(GradingDetail.grade_id.in_(grade_ids)).delete(synchronize_session=False)
            db.query(QuestionFeedback).filter(QuestionFeedback.grade_id.in_(grade_ids)).delete(
                synchronize_session=False
            )
            db.query(Grade).filter(Grade.id.in_(grade_ids)).delete(synchronize_session=False)

        question_ids = [q.id for q in db.query(Question.id).filter(Question.attempt_id.in_(attempt_ids)).all()]
        if question_ids:
            db.query(Response).filter(Response.question_id.in_(question_ids)).delete(synchronize_session=False)
            db.query(Question).filter(Question.id.in_(question_ids)).delete(synchronize_session=False)

        db.query(ExamAttempt).filter(ExamAttempt.id.in_(attempt_ids)).delete(synchronize_session=False)

    db.query(ExamLink).filter(ExamLink.exam_id == exam_id).delete()
    db.query(IdVerificationPhoto).filter(IdVerificationPhoto.exam_id == exam_id).delete()

    submissions = db.query(ExamSubmission).filter(ExamSubmission.exam_id == exam_id).all()
    for submission in submissions:
        delete_submission_chunks(submission.id)
    db.query(ExamSubmission).filter(ExamSubmission.exam_id == exam_id).delete()

    db.delete(exam)
    db.commit()


@router.post("/exams/{exam_id}/publish", response_model=ExamOut)
def publish_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam = get_owned_exam(exam_id, db, current_user)
    exam.status = ExamStatus.published
    db.commit()
    db.refresh(exam)
    return exam


# Attempts/results for an exam are listed via GET /exams/{exam_id}/attempts
# in routers/grades.py, not here — kept in one place rather than duplicating
# the same join+grade lookup in both routers.
