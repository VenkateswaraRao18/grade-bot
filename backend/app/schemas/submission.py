import uuid
from datetime import datetime

from pydantic import BaseModel


class SubmissionOut(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    original_filename: str
    content_type: str
    indexed: bool
    submitted_at: datetime

    class Config:
        from_attributes = True


class SubmissionWithStudentOut(SubmissionOut):
    # Exactly one of these is set — the legacy self-service upload path sets
    # student_email, the instructor bulk-tagged path sets student_id_number.
    student_email: str | None = None
    student_id_number: str | None = None


class BulkSubmissionResult(BaseModel):
    total: int
    created: int
    updated: int
    # Always empty at response time now — indexing runs in the background
    # after the response is sent (see routers/submissions.py), so a failure
    # can't be known yet here. Check each submission's `indexed` flag via
    # GET /exams/{id}/submissions instead.
    failed_indexing: list[str]
