import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, LargeBinary, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IdVerificationPhoto(Base):
    """The ID photo captured at start-of-exam verification (see
    routers/public_exam.py), kept for the instructor to review alongside
    the end-of-exam recheck photo. Keyed on (exam_id, candidate_id_number)
    rather than attempt_id, since the photo is captured before the
    ExamAttempt row exists — a retake overwrites rather than accumulating
    rows, same as a resubmitted document replaces rather than duplicates."""

    __tablename__ = "id_verification_photos"
    __table_args__ = (
        UniqueConstraint("exam_id", "candidate_id_number", name="uq_id_photo_exam_candidate"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False, index=True
    )
    candidate_id_number: Mapped[str] = mapped_column(String, nullable=False, index=True)
    photo_data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_type: Mapped[str] = mapped_column(String, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
