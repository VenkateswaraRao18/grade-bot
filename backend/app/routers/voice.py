import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.deps import get_voice_caller
from app.models.exam_attempt import ExamAttempt
from app.models.user import User
from app.services.voice_provider import stt_provider, tts_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])

MAX_AUDIO_BYTES = 25 * 1024 * 1024


class SpeakRequest(BaseModel):
    text: str


class TranscribeResponse(BaseModel):
    text: str


@router.post("/speak")
def speak(payload: SpeakRequest, caller: User | ExamAttempt = Depends(get_voice_caller)):
    if tts_provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Text-to-speech isn't configured (missing ElevenLabs API key or voice ID).",
        )
    try:
        audio_bytes, content_type = tts_provider.synthesize(payload.text)
    except Exception:
        logger.exception("ElevenLabs TTS request failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Speech synthesis failed.")
    return Response(content=audio_bytes, media_type=content_type)


@router.post("/transcribe", response_model=TranscribeResponse)
def transcribe(file: UploadFile, caller: User | ExamAttempt = Depends(get_voice_caller)):
    if stt_provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech-to-text isn't configured (missing ElevenLabs API key).",
        )
    contents = file.file.read()
    if len(contents) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Audio too large.")
    if not contents:
        return TranscribeResponse(text="")
    try:
        text = stt_provider.transcribe(contents, file.content_type or "audio/webm")
    except Exception:
        logger.exception("ElevenLabs STT request failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed.")
    return TranscribeResponse(text=text)
