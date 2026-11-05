import uuid

from pydantic import BaseModel


class ExamLinkOut(BaseModel):
    exam_id: uuid.UUID
    link_token: str
    # None only for a link created before passcodes were stored in
    # plaintext and never regenerated since.
    passcode: str | None


class ExamLinkCreateOut(ExamLinkOut):
    passcode: str
