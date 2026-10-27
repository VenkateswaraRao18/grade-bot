import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.exam import Difficulty, ExamStatus


class ExamCreate(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    duration_minutes: int = Field(gt=0)
    difficulty: Difficulty
    min_questions: int = Field(gt=0)
    max_questions: int = Field(gt=0)
    adaptive_enabled: bool = True
    thinking_time_seconds: int = Field(gt=0, default=30)
    rubric: str | None = None
    sample_questions: str | None = None
    instructor_answer: str | None = None

    @model_validator(mode="after")
    def question_range_valid(self) -> "ExamCreate":
        if self.max_questions < self.min_questions:
            raise ValueError("max_questions must be >= min_questions")
        return self


class ExamRubricUpdate(BaseModel):
    rubric: str = Field(min_length=1)


class ExamUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    description: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    difficulty: Difficulty | None = None
    min_questions: int | None = Field(default=None, gt=0)
    max_questions: int | None = Field(default=None, gt=0)
    adaptive_enabled: bool | None = None
    thinking_time_seconds: int | None = Field(default=None, gt=0)
    rubric: str | None = None
    sample_questions: str | None = None
    instructor_answer: str | None = None


class ExamOut(BaseModel):
    id: uuid.UUID
    instructor_id: uuid.UUID
    name: str
    description: str | None
    duration_minutes: int
    difficulty: Difficulty
    min_questions: int
    max_questions: int
    adaptive_enabled: bool
    thinking_time_seconds: int
    status: ExamStatus
    created_at: datetime
    updated_at: datetime
    rubric: str
    sample_questions: str | None
    instructor_answer: str | None

    class Config:
        from_attributes = True
