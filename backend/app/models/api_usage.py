import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ApiUsageLog(Base):
    """One row per external AI call, for the instructor-facing cost audit
    dashboard. Platform-wide by design (not tied to a course/exam/attempt) —
    see the dashboard endpoint for how it's read.

    Claude is the only provider logged here: cost per call is computed at
    insert time from token counts, since Anthropic has no API to look up
    spend after the fact. ElevenLabs is the opposite case — it exposes live
    account quota directly (see routers/dashboard.py), so there's nothing
    to log locally for it."""

    __tablename__ = "api_usage_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    provider: Mapped[str] = mapped_column(String, nullable=False, default="claude")
    # examiner_question | warmup_question | grading
    call_type: Mapped[str] = mapped_column(String, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    # Null when the model isn't in the pricing table (see services/pricing.py)
    # rather than a misleading 0.0.
    estimated_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
