import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.grade import GradeStatus


class GradingDetailOut(BaseModel):
    id: uuid.UUID
    criterion: str
    score: float
    max_score: float
    evidence_text: str | None
    reasoning: str | None

    class Config:
        from_attributes = True


class GradeOut(BaseModel):
    id: uuid.UUID
    attempt_id: uuid.UUID
    status: GradeStatus
    ai_score: float | None
    ai_max_score: float | None
    instructor_score: float | None
    strengths: str | None
    weaknesses: str | None
    instructor_feedback: str | None
    confidence: float | None
    published_at: datetime | None
    created_at: datetime
    details: list[GradingDetailOut]

    class Config:
        from_attributes = True


class TranscriptEntryOut(BaseModel):
    sequence: int
    question: str
    is_followup: bool
    is_generalization: bool
    is_graded: bool = True
    difficulty: str
    answer: str | None
    ai_score: float | None = None
    ai_max_score: float | None = None
    ai_feedback: str | None = None
    ai_criterion: str | None = None
    source_excerpt: str | None = None
    highlight_terms: list[str] | None = None


class AttemptContextOut(BaseModel):
    student_email: str
    exam_name: str
    status: str
    ended_reason: str | None = None
    has_end_photo: bool = False
    has_id_photo: bool = False


class GradeReviewOut(BaseModel):
    grade: GradeOut
    transcript: list[TranscriptEntryOut]
    student_email: str
    exam_name: str


class GradeOverride(BaseModel):
    instructor_score: float | None = None
    criterion_scores: dict[str, float] | None = None
    instructor_feedback: str | None = None
    reason: str = Field(min_length=1)


class AuditLogEntryOut(BaseModel):
    id: uuid.UUID
    actor_email: str
    action: str
    old_value: dict | None
    new_value: dict | None
    reason: str | None
    timestamp: datetime

    class Config:
        from_attributes = True


