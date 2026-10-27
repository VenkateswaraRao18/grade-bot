import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
# Aliased — app.models.exam_attempt.Response (a student's answer row) is
# already the name used throughout this file; this is the HTTP response.
from fastapi.responses import Response as RawResponse
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.core.security import create_grade_share_token
from app.db.session import get_db
from app.models.exam import Exam
from app.models.exam_attempt import AttemptStatus, ExamAttempt, Question, Response
from app.models.grade import AuditLog, Grade, GradeStatus, GradingDetail, QuestionFeedback
from app.models.id_verification_photo import IdVerificationPhoto
from app.models.user import User, UserRole
from app.routers.exams import get_owned_exam
from app.schemas.grade import (
    AttemptContextOut,
    AuditLogEntryOut,
    GradeOut,
    GradeOverride,
    GradeReviewOut,
    GradingDetailOut,
    TranscriptEntryOut,
)
from app.services.attempt_identity import attempt_display_name
from app.services.auto_grading import grade_attempt_now

router = APIRouter(tags=["grades"])


def _grade_to_out(grade: Grade, db: Session) -> GradeOut:
    details = db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id).all()
    return GradeOut(
        id=grade.id,
        attempt_id=grade.attempt_id,
        status=grade.status,
        ai_score=grade.ai_score,
        ai_max_score=grade.ai_max_score,
        instructor_score=grade.instructor_score,
        strengths=grade.strengths,
        weaknesses=grade.weaknesses,
        instructor_feedback=grade.instructor_feedback,
        confidence=grade.confidence,
        published_at=grade.published_at,
        created_at=grade.created_at,
        details=[GradingDetailOut.model_validate(d, from_attributes=True) for d in details],
    )


def get_owned_attempt_for_instructor(attempt_id: uuid.UUID, db: Session, current_user: User) -> ExamAttempt:
    attempt = db.get(ExamAttempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
    get_owned_exam(attempt.exam_id, db, current_user)
    return attempt


def _transcript_qa(attempt_id: uuid.UUID, db: Session) -> list[tuple[Question, Response | None]]:
    questions = db.query(Question).filter(Question.attempt_id == attempt_id).order_by(Question.sequence).all()
    return [(q, db.query(Response).filter(Response.question_id == q.id).first()) for q in questions]


@router.post("/attempts/{attempt_id}/grade", response_model=GradeOut, status_code=status.HTTP_201_CREATED)
def grade_attempt(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)

    grade = grade_attempt_now(attempt, exam, db)
    if grade is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This attempt has no graded questions yet",
        )

    return _grade_to_out(grade, db)


@router.get("/attempts/{attempt_id}/context", response_model=AttemptContextOut)
def get_attempt_context(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Student/exam identity for an attempt, independent of grading status —
    lets the grade-review page show who/what it's grading even before any
    grade exists (GET /attempts/{id}/grade 404s until then)."""
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    exam = db.get(Exam, attempt.exam_id)
    student = db.get(User, attempt.student_id) if attempt.student_id else None
    has_id_photo = False
    if attempt.candidate_id_number:
        has_id_photo = (
            db.query(IdVerificationPhoto)
            .filter(
                IdVerificationPhoto.exam_id == attempt.exam_id,
                IdVerificationPhoto.candidate_id_number == attempt.candidate_id_number,
            )
            .first()
            is not None
        )
    return AttemptContextOut(
        student_email=attempt_display_name(attempt, student),
        exam_name=exam.name,
        status=attempt.status.value,
        ended_reason=attempt.ended_reason,
        has_end_photo=bool(attempt.end_photo_data),
        has_id_photo=has_id_photo,
    )


@router.get("/attempts/{attempt_id}/end-photo")
def get_end_photo(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    if not attempt.end_photo_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No end-of-exam photo for this attempt")
    return RawResponse(content=attempt.end_photo_data, media_type=attempt.end_photo_content_type or "image/jpeg")


@router.get("/attempts/{attempt_id}/id-photo")
def get_id_photo(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """The start-of-exam ID verification photo, kept separately from the
    attempt (see models/id_verification_photo.py — it predates the attempt
    row existing), looked up by the same (exam_id, candidate_id_number)
    pair that identifies this attempt's candidate."""
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    if not attempt.candidate_id_number:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No ID photo for this attempt")
    photo = (
        db.query(IdVerificationPhoto)
        .filter(
            IdVerificationPhoto.exam_id == attempt.exam_id,
            IdVerificationPhoto.candidate_id_number == attempt.candidate_id_number,
        )
        .first()
    )
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No ID photo for this attempt")
    return RawResponse(content=photo.photo_data, media_type=photo.content_type)


@router.get("/attempts/{attempt_id}/grade", response_model=GradeReviewOut)
def get_attempt_grade(
    attempt_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    attempt = get_owned_attempt_for_instructor(attempt_id, db, current_user)
    grade = db.query(Grade).filter(Grade.attempt_id == attempt_id).first()
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not graded yet")

    exam = db.get(Exam, attempt.exam_id)
    student = db.get(User, attempt.student_id) if attempt.student_id else None

    qa_pairs = _transcript_qa(attempt_id, db)
    feedback_by_question = {
        qf.question_id: qf
        for qf in db.query(QuestionFeedback).filter(QuestionFeedback.grade_id == grade.id)
    }
    transcript = [
        TranscriptEntryOut(
            sequence=q.sequence,
            question=q.text,
            is_followup=q.is_followup,
            is_generalization=q.is_generalization,
            is_graded=q.is_graded,
            difficulty=q.difficulty.value,
            answer=r.transcript_text if r else None,
            ai_score=feedback_by_question[q.id].score if q.id in feedback_by_question else None,
            ai_max_score=feedback_by_question[q.id].max_score if q.id in feedback_by_question else None,
            ai_feedback=feedback_by_question[q.id].feedback if q.id in feedback_by_question else None,
            ai_criterion=feedback_by_question[q.id].criterion if q.id in feedback_by_question else None,
            source_excerpt=q.source_excerpt,
            highlight_terms=q.highlight_terms,
        )
        for q, r in qa_pairs
    ]
    return GradeReviewOut(
        grade=_grade_to_out(grade, db),
        transcript=transcript,
        student_email=attempt_display_name(attempt, student),
        exam_name=exam.name,
    )


@router.patch("/grades/{grade_id}", response_model=GradeOut)
def override_grade(
    grade_id: uuid.UUID,
    payload: GradeOverride,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    get_owned_exam(attempt.exam_id, db, current_user)

    old_value = {
        "instructor_score": grade.instructor_score,
        "instructor_feedback": grade.instructor_feedback,
        "criterion_scores": {
            d.criterion: d.score for d in db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id)
        },
    }

    if payload.instructor_score is not None:
        grade.instructor_score = payload.instructor_score

    if payload.instructor_feedback is not None:
        grade.instructor_feedback = payload.instructor_feedback

    new_criterion_scores = {}
    if payload.criterion_scores:
        details = {d.criterion: d for d in db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id)}
        for criterion, score in payload.criterion_scores.items():
            if criterion in details:
                details[criterion].score = score
                new_criterion_scores[criterion] = score

    grade.status = GradeStatus.instructor_review
    db.commit()
    db.refresh(grade)

    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="grade_edited",
            entity_type="grade",
            entity_id=grade.id,
            old_value=old_value,
            new_value={
                "instructor_score": payload.instructor_score,
                "instructor_feedback": payload.instructor_feedback,
                "criterion_scores": new_criterion_scores,
            },
            reason=payload.reason,
        )
    )
    db.commit()

    return _grade_to_out(grade, db)


@router.post("/grades/{grade_id}/finalize", response_model=GradeOut)
def finalize_grade(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    get_owned_exam(attempt.exam_id, db, current_user)

    if grade.status not in (GradeStatus.ai_graded, GradeStatus.instructor_review):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Grade cannot be finalized from its current status")

    grade.status = GradeStatus.finalized
    db.commit()
    db.refresh(grade)
    return _grade_to_out(grade, db)


@router.post("/grades/{grade_id}/publish", response_model=GradeOut)
def publish_grade(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    get_owned_exam(attempt.exam_id, db, current_user)

    if grade.status != GradeStatus.finalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only finalized grades can be published")

    grade.status = GradeStatus.published
    grade.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(grade)

    db.add(
        AuditLog(
            actor_id=current_user.id,
            action="grade_published",
            entity_type="grade",
            entity_id=grade.id,
            old_value=None,
            new_value=None,
        )
    )
    db.commit()

    return _grade_to_out(grade, db)


@router.get("/grades/{grade_id}/share-link")
def get_grade_share_link(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """The token for this grade's public results page — only meaningful
    once published (CLAUDE.md §7: nothing reaches a student pre-publish).
    Safe to call repeatedly: see create_grade_share_token, same token comes
    back every time until the grade is republished."""
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    get_owned_exam(attempt.exam_id, db, current_user)

    if grade.status != GradeStatus.published or grade.published_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This grade isn't published yet")

    return {"token": create_grade_share_token(grade.id, grade.published_at)}


@router.get("/grades/{grade_id}/audit-log", response_model=list[AuditLogEntryOut])
def get_grade_audit_log(
    grade_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    grade = db.get(Grade, grade_id)
    if grade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade not found")
    attempt = db.get(ExamAttempt, grade.attempt_id)
    get_owned_exam(attempt.exam_id, db, current_user)

    entries = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type == "grade", AuditLog.entity_id == grade_id)
        .order_by(AuditLog.timestamp.desc())
        .all()
    )
    actor_ids = {e.actor_id for e in entries}
    actors = {u.id: u.email for u in db.query(User).filter(User.id.in_(actor_ids))} if actor_ids else {}
    return [
        AuditLogEntryOut(
            id=e.id,
            actor_email=actors.get(e.actor_id, "unknown"),
            action=e.action,
            old_value=e.old_value,
            new_value=e.new_value,
            reason=e.reason,
            timestamp=e.timestamp,
        )
        for e in entries
    ]


@router.get("/instructor/attempts/pending-review")
def list_pending_review(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Completed attempts, across all of this instructor's exams, that
    aren't published yet — the thing an instructor has no way to notice
    otherwise, since grading is never automatic."""
    rows = (
        db.query(ExamAttempt, Exam, User, Grade)
        .join(Exam, ExamAttempt.exam_id == Exam.id)
        .outerjoin(User, ExamAttempt.student_id == User.id)
        .outerjoin(Grade, Grade.attempt_id == ExamAttempt.id)
        .filter(
            Exam.instructor_id == current_user.id,
            ExamAttempt.status == AttemptStatus.completed,
            or_(Grade.id.is_(None), Grade.status != GradeStatus.published),
        )
        .order_by(ExamAttempt.ended_at.desc())
        .all()
    )
    return [
        {
            "attempt_id": attempt.id,
            "student_email": attempt_display_name(attempt, student),
            "exam_name": exam.name,
            "ended_at": attempt.ended_at,
            "ended_reason": attempt.ended_reason,
            "grade_status": grade.status.value if grade else None,
            "ai_score": grade.ai_score if grade else None,
            "ai_max_score": grade.ai_max_score if grade else None,
        }
        for attempt, exam, student, grade in rows
        if db.query(Question).filter(Question.attempt_id == attempt.id).first() is not None
    ]


@router.get("/exams/{exam_id}/attempts")
def list_exam_attempts(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    get_owned_exam(exam_id, db, current_user)

    attempts = db.query(ExamAttempt).filter(ExamAttempt.exam_id == exam_id).all()
    result = []
    for attempt in attempts:
        student = db.get(User, attempt.student_id) if attempt.student_id else None
        grade = db.query(Grade).filter(Grade.attempt_id == attempt.id).first()
        is_published = bool(grade and grade.status == GradeStatus.published and grade.published_at)
        result.append(
            {
                "attempt_id": attempt.id,
                "student_email": attempt_display_name(attempt, student),
                "candidate_name": attempt.candidate_name,
                "candidate_id_number": attempt.candidate_id_number,
                "account_email": student.email if student else None,
                "status": attempt.status.value,
                "ended_at": attempt.ended_at,
                "ended_reason": attempt.ended_reason,
                "grade_id": grade.id if grade else None,
                "grade_status": grade.status.value if grade else None,
                "ai_score": grade.ai_score if grade else None,
                "ai_max_score": grade.ai_max_score if grade else None,
                "instructor_score": grade.instructor_score if grade else None,
                "share_token": create_grade_share_token(grade.id, grade.published_at) if is_published else None,
            }
        )
    return result


@router.get("/exams/{exam_id}/grades/export")
def export_exam_grades_csv(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """A plain CSV of this exam's results, for the instructor's own records
    or for manually re-entering into Canvas's gradebook. Not a verified
    one-click Canvas gradebook re-import — Canvas's CSV import matches
    assignment columns by the exact "Name (assignment_id)" header from its
    own export, which we don't retain, so this uses a plain, readable
    header instead of trying to fake that format."""
    exam = get_owned_exam(exam_id, db, current_user)

    attempts = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.exam_id == exam_id, ExamAttempt.status == AttemptStatus.completed)
        .order_by(ExamAttempt.ended_at)
        .all()
    )

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["Student Name", "Student ID", "Score", "Max Score", "Status", "Completed At", "Published At"]
    )
    for attempt in attempts:
        student = db.get(User, attempt.student_id) if attempt.student_id else None
        grade = db.query(Grade).filter(Grade.attempt_id == attempt.id).first()
        name = attempt.candidate_name or (student.email if student else None) or "Unknown"
        score = None
        if grade is not None:
            score = grade.instructor_score if grade.instructor_score is not None else grade.ai_score
        writer.writerow(
            [
                name,
                attempt.candidate_id_number or "",
                score if score is not None else "",
                grade.ai_max_score if grade and grade.ai_max_score is not None else "",
                grade.status.value if grade else "not_graded",
                attempt.ended_at.isoformat() if attempt.ended_at else "",
                grade.published_at.isoformat() if grade and grade.published_at else "",
            ]
        )
    buffer.seek(0)

    safe_name = "".join(c if c.isalnum() or c in (" ", "-", "_") else "_" for c in exam.name).strip() or "exam"
    filename = f"{safe_name}_grades.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Student-facing published-grade endpoints used to live here, gated on
# require_role(UserRole.student). Removed with the student login/portal
# (CLAUDE.md pivot) — grade visibility is now via a per-attempt results
# share link instead (see routers/public_results.py).
