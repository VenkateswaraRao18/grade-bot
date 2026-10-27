import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Difficulty(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class ExamStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class Exam(Base):
    """The only thing an instructor creates (CLAUDE.md pivot: no more
    Course/Module/Assignment scaffolding — an exam owns its own settings,
    optional reference material, and bulk-uploaded student documents
    directly)."""

    __tablename__ = "exams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Free-text context for what this exam covers — feeds retrieval's topic
    # query and shows the instructor what the exam is about. Replaces the
    # old per-assignment title/description.
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, name="difficulty"), nullable=False)
    min_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    max_questions: Mapped[int] = mapped_column(Integer, nullable=False)
    adaptive_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    thinking_time_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    rubric: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=(
            "Grade the student on: (1) conceptual understanding, (2) clarity and correctness of "
            "explanation, (3) appropriate use of terminology. Score each 0-100."
        ),
    )
    sample_questions: Mapped[str | None] = mapped_column(Text, nullable=True)
    # The instructor's own expected answer/grading key — ground truth for
    # both scoping question generation and grading. Optional: exams work
    # without it, falling back to the student's own submission + description.
    instructor_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ExamStatus] = mapped_column(
        Enum(ExamStatus, name="exam_status"), nullable=False, default=ExamStatus.draft
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
