import logging

import httpx
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import require_role
from app.db.session import get_db
from app.models.api_usage import ApiUsageLog
from app.models.exam import Exam
from app.models.exam_attempt import AttemptStatus, ExamAttempt
from app.models.grade import Grade, GradeStatus
from app.models.user import User, UserRole
from app.services.voice_provider import ELEVENLABS_BASE_URL

logger = logging.getLogger(__name__)
router = APIRouter(tags=["dashboard"])


@router.get("/instructor/stats")
def instructor_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    exam_ids = [e.id for e in db.query(Exam.id).filter(Exam.instructor_id == current_user.id).all()]
    exam_count = len(exam_ids)
    attempt_count = (
        db.query(ExamAttempt)
        .filter(ExamAttempt.exam_id.in_(exam_ids), ExamAttempt.status == AttemptStatus.completed)
        .count()
        if exam_ids
        else 0
    )
    attempt_ids = (
        [a.id for a in db.query(ExamAttempt.id).filter(ExamAttempt.exam_id.in_(exam_ids)).all()]
        if exam_ids
        else []
    )
    published_count = (
        db.query(Grade)
        .filter(Grade.attempt_id.in_(attempt_ids), Grade.status == GradeStatus.published)
        .count()
        if attempt_ids
        else 0
    )

    return {
        "exam_count": exam_count,
        "completed_attempt_count": attempt_count,
        "published_grade_count": published_count,
    }


@router.get("/instructor/usage")
def instructor_usage(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.instructor)),
):
    """Cost/usage audit for instructor review. Platform-wide, not per-course
    or per-exam (deliberate scope decision — see api_usage.py).

    Claude: our own ledger, since Anthropic has no API for a key's remaining
    balance — only ever "spent so far", never "remaining".
    ElevenLabs: the opposite shape. They DO expose live account quota, so
    rather than keep our own ledger (which could drift from their real
    billing), we just ask them directly on every dashboard load."""
    rows = (
        db.query(
            ApiUsageLog.call_type,
            func.count(ApiUsageLog.id),
            func.sum(ApiUsageLog.input_tokens),
            func.sum(ApiUsageLog.output_tokens),
            func.sum(ApiUsageLog.estimated_cost_usd),
        )
        .filter(ApiUsageLog.provider == "claude")
        .group_by(ApiUsageLog.call_type)
        .all()
    )
    by_call_type = [
        {
            "call_type": call_type,
            "call_count": count,
            "input_tokens": int(input_tokens or 0),
            "output_tokens": int(output_tokens or 0),
            "estimated_cost_usd": round(cost, 4) if cost is not None else None,
        }
        for call_type, count, input_tokens, output_tokens, cost in rows
    ]
    claude_usage = {
        "model": settings.claude_model,
        "total_calls": sum(r["call_count"] for r in by_call_type),
        "total_input_tokens": sum(r["input_tokens"] for r in by_call_type),
        "total_output_tokens": sum(r["output_tokens"] for r in by_call_type),
        "total_estimated_cost_usd": round(
            sum(r["estimated_cost_usd"] for r in by_call_type if r["estimated_cost_usd"] is not None), 4
        ),
        "has_unpriced_calls": any(r["estimated_cost_usd"] is None and r["call_count"] > 0 for r in by_call_type),
        "by_call_type": by_call_type,
        "note": "Estimated from token counts at our own pricing table — not Anthropic's billing system. "
        "Anthropic has no API for a key's remaining balance, so this is spend only, not a remaining figure.",
    }

    gemini_usage = None
    if settings.gemini_api_key:
        gemini_rows = (
            db.query(
                ApiUsageLog.call_type,
                func.count(ApiUsageLog.id),
                func.sum(ApiUsageLog.input_tokens),
                func.sum(ApiUsageLog.estimated_cost_usd),
            )
            .filter(ApiUsageLog.provider == "gemini")
            .group_by(ApiUsageLog.call_type)
            .all()
        )
        gemini_by_call_type = [
            {
                "call_type": call_type,
                "call_count": count,
                "input_tokens": int(input_tokens or 0),
                "estimated_cost_usd": round(cost, 4) if cost is not None else None,
            }
            for call_type, count, input_tokens, cost in gemini_rows
        ]
        gemini_usage = {
            "model": settings.gemini_embed_model,
            "total_calls": sum(r["call_count"] for r in gemini_by_call_type),
            "total_input_tokens": sum(r["input_tokens"] for r in gemini_by_call_type),
            "total_estimated_cost_usd": round(
                sum(r["estimated_cost_usd"] for r in gemini_by_call_type if r["estimated_cost_usd"] is not None),
                4,
            ),
            "has_unpriced_calls": any(
                r["estimated_cost_usd"] is None and r["call_count"] > 0 for r in gemini_by_call_type
            ),
            "by_call_type": gemini_by_call_type,
            "note": "Token counts are a character-based estimate (Gemini's embed API doesn't report exact "
            "usage), and cost is estimated from our own pricing table — not Google's billing system. Google "
            "doesn't expose a remaining-credit API for this key, so this is spend only, never a remaining "
            "balance.",
        }

    elevenlabs_usage = None
    elevenlabs_error = None
    if settings.elevenlabs_api_key:
        try:
            with httpx.Client(base_url=ELEVENLABS_BASE_URL, timeout=10.0) as client:
                res = client.get(
                    "/user/subscription", headers={"xi-api-key": settings.elevenlabs_api_key}
                )
                res.raise_for_status()
                data = res.json()
            used = data.get("character_count")
            limit = data.get("character_limit")
            elevenlabs_usage = {
                "characters_used": used,
                "characters_limit": limit,
                "characters_remaining": (limit - used) if used is not None and limit is not None else None,
                "tier": data.get("tier"),
                "next_reset_unix": data.get("next_character_count_reset_unix"),
            }
        except Exception:
            logger.exception("Failed to fetch ElevenLabs subscription usage")
            elevenlabs_error = "Could not reach ElevenLabs to fetch live quota."

    return {
        "claude": claude_usage,
        "gemini": gemini_usage,
        "elevenlabs": elevenlabs_usage,
        "elevenlabs_error": elevenlabs_error,
    }
