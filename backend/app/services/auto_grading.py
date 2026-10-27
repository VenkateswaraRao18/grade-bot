import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.exam import Exam
from app.models.exam_attempt import ExamAttempt, Question, Response
from app.models.grade import Grade, GradeStatus, GradingDetail, QuestionFeedback
from app.services.grading_agent import build_transcript, grade_transcript

logger = logging.getLogger(__name__)

# Bounded on purpose: an unbounded thread-per-attempt approach means a whole
# class finishing near the same deadline fires 100+ simultaneous LLM calls
# at once, which exhausts the DB connection pool (shared with students still
# mid-exam) and trips the LLM provider's rate limit. A small worker pool
# queues the rest and drains them a few at a time instead.
_MAX_CONCURRENT_GRADING_JOBS = 5
_executor = ThreadPoolExecutor(max_workers=_MAX_CONCURRENT_GRADING_JOBS, thread_name_prefix="auto-grade")


def grade_attempt_now(attempt: ExamAttempt, exam: Exam, db: Session) -> Grade | None:
    """Runs the AI grader against a completed attempt's transcript and
    writes the resulting Grade (+ its GradingDetail/QuestionFeedback rows).
    Returns None if there's nothing gradeable yet (no graded questions were
    asked). Shared by the instructor's manual "Run AI grading" retry button
    and by automatic grading on attempt completion, so by the time an
    instructor opens the review queue a grade is normally already there —
    CLAUDE.md's grade lifecycle starts at DRAFT/AI_GRADED, not at "nothing"."""
    qa_pairs = (
        db.query(Question, Response)
        .outerjoin(Response, Response.question_id == Question.id)
        .filter(Question.attempt_id == attempt.id)
        .order_by(Question.sequence)
        .all()
    )
    graded_qa_pairs = [(q, r) for q, r in qa_pairs if q.is_graded]
    if not graded_qa_pairs:
        return None

    transcript = build_transcript(
        [(q.sequence, q.text, r.transcript_text if r else None) for q, r in graded_qa_pairs]
    )
    reference_answers = exam.instructor_answer or ""
    # llm_provider.generate() already retries transient failures internally
    # (see llm_provider._with_retry) — this call either succeeds or raises
    # after exhausting those, before any DB write below happens.
    result = grade_transcript(exam.rubric, transcript, reference_answers)

    grade = db.query(Grade).filter(Grade.attempt_id == attempt.id).first()
    if grade is None:
        grade = Grade(attempt_id=attempt.id)
        db.add(grade)
    else:
        db.query(GradingDetail).filter(GradingDetail.grade_id == grade.id).delete()
        db.query(QuestionFeedback).filter(QuestionFeedback.grade_id == grade.id).delete()

    grade.status = GradeStatus.ai_graded
    grade.ai_score = result.overall_score
    grade.ai_max_score = result.overall_max
    grade.strengths = result.strengths
    grade.weaknesses = result.weaknesses
    grade.confidence = result.confidence
    db.commit()
    db.refresh(grade)

    for c in result.criteria:
        db.add(
            GradingDetail(
                grade_id=grade.id,
                criterion=c.name,
                score=c.score,
                max_score=c.max_score,
                evidence_text=c.evidence,
                reasoning=c.reasoning,
            )
        )

    sequence_to_question_id = {q.sequence: q.id for q, _ in qa_pairs}
    for qf in result.questions:
        question_id = sequence_to_question_id.get(qf.sequence)
        if question_id is None:
            continue
        db.add(
            QuestionFeedback(
                grade_id=grade.id,
                question_id=question_id,
                score=qf.score,
                max_score=qf.max_score,
                feedback=qf.feedback,
                criterion=qf.criterion,
            )
        )
    db.commit()

    return grade


def _run_in_background(attempt_id: uuid.UUID, exam_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        attempt = db.get(ExamAttempt, attempt_id)
        exam = db.get(Exam, exam_id)
        if attempt is None or exam is None:
            return
        grade_attempt_now(attempt, exam, db)
    except Exception as exc:
        # Best-effort: the instructor's "Run AI grading" button on the
        # review page is still there as a manual retry — a background
        # grading failure must never surface as an error to the student
        # finishing their exam, just get logged for the instructor's sake.
        logger.warning("Auto-grading failed for attempt %s: %s", attempt_id, exc)
    finally:
        db.close()


def schedule_auto_grading(attempt_id: uuid.UUID, exam_id: uuid.UUID) -> None:
    """Queues AI grading the instant an attempt completes, off the request
    thread so the student-facing finish/status endpoints don't block on an
    LLM call. Backed by a bounded worker pool (see _MAX_CONCURRENT_GRADING_
    JOBS) rather than one thread per attempt, so a whole class finishing at
    once queues up and drains a few at a time instead of all firing
    simultaneously. An instructor opening the review queue later finds the
    grade already waiting instead of needing to click anything."""
    _executor.submit(_run_in_background, attempt_id, exam_id)
