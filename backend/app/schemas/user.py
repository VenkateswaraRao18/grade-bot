import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.user import UserRole


class UserRegister(BaseModel):
    """Only instructors register through the app (CLAUDE.md pivot: students
    never have accounts — they join an exam via its passcode link instead,
    see routers/public_exam.py). The role is implicit, not a client choice."""

    email: EmailStr
    password: str = Field(min_length=8)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: EmailStr
    role: UserRole
    student_id_number: str | None
    id_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
