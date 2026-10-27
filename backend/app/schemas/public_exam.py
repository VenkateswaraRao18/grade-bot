import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.exam import Difficulty


class EnterExamIn(BaseModel):
    passcode: str


class PublicExamEntryOut(BaseModel):
    entry_token: str
    exam_name: str
    duration_minutes: int
    difficulty: Difficulty
    thinking_time_seconds: int
    rubric: str


class PublicVerifyIdOut(BaseModel):
    matched: bool
    verified_token: str | None = None
    extracted_text: str
    # True when the OCR match succeeded but this candidate already has a
    # completed attempt for this exam — verified_token is withheld in that
    # case (nothing to start), so the student finds out right after the ID
    # photo instead of after also sitting through mic setup, just to be
    # blocked at the final "Start Exam" click.
    already_completed: bool = False


class PublicStartOut(BaseModel):
    attempt_id: uuid.UUID
    session_token: str
    status: str
    server_start_time: datetime
    duration_minutes: int
