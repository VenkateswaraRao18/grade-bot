"""Thin interface over the TTS/STT backend, mirroring llm_provider.py's
provider-swap principle (CLAUDE.md §3). lib/speech.ts on the frontend is the
designated swap point on that side — this is the backend half."""

from abc import ABC, abstractmethod

import httpx

from app.core.config import settings

ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1"


class TTSProvider(ABC):
    @abstractmethod
    def synthesize(self, text: str) -> tuple[bytes, str]:
        """Returns (audio_bytes, content_type)."""
        ...


class STTProvider(ABC):
    @abstractmethod
    def transcribe(self, audio_bytes: bytes, content_type: str) -> str: ...


class ElevenLabsTTSProvider(TTSProvider):
    def __init__(self, api_key: str, voice_id: str, model_id: str = "eleven_multilingual_v2"):
        self.api_key = api_key
        self.voice_id = voice_id
        self.model_id = model_id

    def synthesize(self, text: str) -> tuple[bytes, str]:
        with httpx.Client(base_url=ELEVENLABS_BASE_URL, timeout=30.0) as client:
            res = client.post(
                f"/text-to-speech/{self.voice_id}",
                headers={"xi-api-key": self.api_key, "Content-Type": "application/json"},
                json={"text": text, "model_id": self.model_id},
            )
            res.raise_for_status()
            return res.content, "audio/mpeg"


class ElevenLabsSTTProvider(STTProvider):
    def __init__(self, api_key: str, model_id: str = "scribe_v2"):
        self.api_key = api_key
        self.model_id = model_id

    def transcribe(self, audio_bytes: bytes, content_type: str) -> str:
        with httpx.Client(base_url=ELEVENLABS_BASE_URL, timeout=60.0) as client:
            res = client.post(
                "/speech-to-text",
                headers={"xi-api-key": self.api_key},
                data={"model_id": self.model_id},
                files={"file": ("audio", audio_bytes, content_type)},
            )
            res.raise_for_status()
            return res.json().get("text", "")


tts_provider: TTSProvider | None = (
    ElevenLabsTTSProvider(api_key=settings.elevenlabs_api_key, voice_id=settings.elevenlabs_voice_id)
    if settings.elevenlabs_api_key and settings.elevenlabs_voice_id
    else None
)

stt_provider: STTProvider | None = (
    ElevenLabsSTTProvider(api_key=settings.elevenlabs_api_key) if settings.elevenlabs_api_key else None
)
