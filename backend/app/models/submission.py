import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExamSubmission(Base):
    """One student's submitted work for one exam. Either uploaded by the
    student themselves (student_id set — legacy self-service path, retired
    along with student login) or by the instructor in bulk and tagged with
    the student's ID number (student_id_number set — the exam-link passcode
    flow). Exactly one of the two identifies whose work this is. A
    resubmission/re-tag replaces the file and re-indexes rather than
    accumulating rows."""

    __tablename__ = "exam_submissions"
    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_submission_exam_student"),
        UniqueConstraint("exam_id", "student_id_number", name="uq_submission_exam_student_id_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False, index=True
    )
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    student_id_number: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    indexed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
