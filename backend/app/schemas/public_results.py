from datetime import datetime

from pydantic import BaseModel

from app.schemas.grade import GradingDetailOut, TranscriptEntryOut


class PublicResultsOut(BaseModel):
    exam_name: str
    candidate_name: str | None
    score: float | None
    max_score: float | None
    strengths: str | None
    weaknesses: str | None
    instructor_feedback: str | None
    published_at: datetime | None
    details: list[GradingDetailOut]
    transcript: list[TranscriptEntryOut]
