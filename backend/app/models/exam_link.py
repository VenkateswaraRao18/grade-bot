import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ExamLink(Base):
    """A passcode-protected public link for an exam (CLAUDE.md pivot: no
    student accounts — instructors paste this link into Canvas manually and
    students self-identify via ID photo once inside). One link per exam;
    regenerating rotates both the token and the passcode in place rather
    than leaving an old link live alongside a new one."""

    __tablename__ = "exam_links"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False, unique=True, index=True
    )
    link_token: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    # Stored in plaintext deliberately — the instructor needs to be able to
    # look this up any time (not just once at generation), and it's a code
    # shared with ~160 students, not a real per-user secret like a password.
    # Nullable only because a link created before this column existed has
    # no recoverable plaintext; the instructor just regenerates it.
    passcode: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
