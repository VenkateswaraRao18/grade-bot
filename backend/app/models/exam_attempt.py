import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.exam import Difficulty


class AttemptStatus(str, enum.Enum):
    in_progress = "in_progress"
    completed = "completed"


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False, index=True)
    # Nullable because passcode-link attempts (no student account — see
    # exam_link.py) have no `users` row to point to; those identify the
    # candidate via candidate_name/candidate_id_number instead. Exactly one
    # of (student_id) or (candidate_id_number) is set per attempt.
    student_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True
    )
    candidate_name: Mapped[str | None] = mapped_column(String, nullable=True)
    candidate_id_number: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    status: Mapped[AttemptStatus] = mapped_column(
        Enum(AttemptStatus, name="attempt_status"), nullable=False, default=AttemptStatus.in_progress
    )
    server_start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Null for a normal completion (timer/question-count exhausted). Set to
    # "integrity_violation" when the client reports the student left
    # full-screen mode or switched away from the exam tab — surfaced to the
    # instructor so a suspiciously short attempt isn't mistaken for one that
    # simply ran out of time.
    ended_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    # A single bookend identity photo taken right after the exam ends (not
    # continuous monitoring during it — that's explicitly out of MVP scope).
    # Mirrors the start-of-exam ID recheck, just at the other end. Stored as
    # bytes directly (not a disk path) so the backend stays stateless.
    end_photo_data: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    end_photo_content_type: Mapped[str | None] = mapped_column(String, nullable=True)


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_attempts.id"), nullable=False, index=True
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    source_chunk_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    difficulty: Mapped[Difficulty] = mapped_column(Enum(Difficulty, name="difficulty"), nullable=False)
    is_followup: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # A "zoom out" question: starts from something concrete in the student's
    # own work but asks them to generalize the underlying concept beyond
    # this specific case — capped per exam (see examiner_agent.py) so the
    # exam stays assignment-grounded by default, with only an occasional
    # bridge to broader understanding.
    is_generalization: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # The first two questions of every exam are generic warm-ups (overall
    # approach/context, not assignment-specific) and explicitly excluded from
    # grading — still shown in the transcript for instructor context, but
    # never fed into grade_transcript. See examiner_agent.py.
    is_graded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # The literal excerpt from the student's own submission (or course
    # material) this question was grounded in — shown to the student
    # alongside the question so a cited number/fact can be quickly verified
    # as genuinely theirs, not a reason to go blank. Null for warm-ups.
    source_excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Exact substrings of source_excerpt this question hinges on, so the
    # frontend can highlight just those instead of the whole excerpt. Null
    # for warm-ups and questions not about a specific value.
    highlight_terms: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    parent_question_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id"), nullable=True
    )
    asked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


class Response(Base):
    __tablename__ = "responses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    question_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False, unique=True, index=True
    )
    transcript_text: Mapped[str] = mapped_column(Text, nullable=False)
    audio_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    # A lightweight live signal (0-10) the examiner reports about THIS answer
    # while deciding the next question — distinct from the end-of-exam
    # grading agent's own scoring. Used only to decide whether the exam has
    # gathered enough signal to end early; never shown as or treated as the
    # official grade.
    examiner_quality_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    answered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
