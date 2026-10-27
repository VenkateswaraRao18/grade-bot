import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.exam import Difficulty
from app.models.exam_attempt import AttemptStatus


class AttemptOut(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    status: AttemptStatus
    server_start_time: datetime
    duration_minutes: int
    ended_at: datetime | None
    ended_reason: str | None = None


class FinishAttemptIn(BaseModel):
    reason: str | None = None


class AttemptStatusOut(BaseModel):
    status: AttemptStatus
    time_remaining_seconds: int
    questions_asked: int
    max_questions: int


class NextQuestionOut(BaseModel):
    finished: bool
    question_id: uuid.UUID | None = None
    sequence: int | None = None
    text: str | None = None
    difficulty: Difficulty | None = None
    is_followup: bool | None = None
    is_generalization: bool | None = None
    is_graded: bool | None = None
    # 1-indexed position among GRADED questions only (null for the ungraded
    # warm-ups) — `sequence` includes the warm-ups, so it's not what should
    # be shown next to max_questions in the UI.
    graded_sequence: int | None = None
    # The excerpt this question was grounded in, shown alongside it so a
    # cited number/fact can be quickly confirmed as genuinely the student's
    # own — never the reasoning/answer, just the source passage.
    source_excerpt: str | None = None
    # Exact substrings of source_excerpt this question hinges on, for the
    # frontend to highlight within the excerpt instead of leaving the
    # student to scan the whole thing.
    highlight_terms: list[str] | None = None
    thinking_time_seconds: int | None = None
    time_remaining_seconds: int
    # Set only when finished=True — the examiner should speak this before the
    # client tears the session down.
    closing_message: str | None = None


class ResponseCreate(BaseModel):
    question_id: uuid.UUID
    transcript_text: str
