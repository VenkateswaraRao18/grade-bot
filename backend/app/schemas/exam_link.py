import uuid

from pydantic import BaseModel


class ExamLinkOut(BaseModel):
    exam_id: uuid.UUID
    link_token: str


class ExamLinkCreateOut(ExamLinkOut):
    # Only ever returned once, right after generation/rotation — the stored
    # hash can't be reversed, so this is the instructor's one chance to see
    # (and copy) the plaintext passcode.
    passcode: str
