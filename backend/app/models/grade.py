import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class GradeStatus(str, enum.Enum):
    draft = "draft"
    ai_graded = "ai_graded"
    instructor_review = "instructor_review"
    finalized = "finalized"
    published = "published"


class Grade(Base):
    __tablename__ = "grades"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id"), nullable=False, unique=True, index=True
    )
    status: Mapped[GradeStatus] = mapped_column(
        Enum(GradeStatus, name="grade_status"), nullable=False, default=GradeStatus.draft
    )
    ai_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    # The point total the AI's score is out of — derived from the exam's
    # rubric at grading time (sum of each criterion's max_score), not
    # hardcoded to 100. Lets an instructor use any scale (e.g. 10+10+10=30)
    # and have every score on screen show its real denominator.
    ai_max_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    instructor_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    strengths: Mapped[str | None] = mapped_column(Text, nullable=True)
    weaknesses: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The instructor's own note, written when overriding — shown to the
    # student alongside the AI's strengths/weaknesses once published.
    # Distinct from an override's audit-log reason (AuditLog.reason), which
    # is internal only and never reaches the student.
    instructor_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class GradingDetail(Base):
    __tablename__ = "grading_details"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("grades.id"), nullable=False, index=True
    )
    criterion: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    # Points this criterion is worth, taken from the instructor's rubric text
    # when it states one (e.g. "(25 pts)"), else an even split of 100 across
    # however many criteria the grader produced. `score` is always <= this.
    # overall_score on Grade is derived from sum(score)/sum(max_score), not
    # a separate LLM guess, so it can never disagree with this breakdown.
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=100.0)
    evidence_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)


class QuestionFeedback(Base):
    """Per-question AI feedback — distinct from GradingDetail's thematic
    rubric criteria. Lets an instructor see why a specific answer scored
    what it did, inline with that question, without reconstructing it from
    the aggregate criteria breakdown."""

    __tablename__ = "question_feedback"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    grade_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("grades.id"), nullable=False, index=True
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False, unique=True, index=True
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    max_score: Mapped[float] = mapped_column(Float, nullable=False, default=10.0)
    feedback: Mapped[str] = mapped_column(Text, nullable=False)
    # Which GradingDetail.criterion this question's answer was scored
    # against — the same rubric criterion the grader fed this question's
    # score into when computing that criterion's score (see grading_agent).
    criterion: Mapped[str] = mapped_column(Text, nullable=False, default="")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    old_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
