"""Thin interface over the LLM/embedding backend so it can be swapped later
(multi-LLM council, a hosted provider) without touching business logic, per
CLAUDE.md's provider-interface principle."""

import logging
import time
from abc import ABC, abstractmethod
from typing import Callable, TypeVar

import httpx
from anthropic import Anthropic

from app.core.config import settings
from app.models.submission_chunk import EMBEDDING_DIM

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = "http://localhost:11434"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

T = TypeVar("T")

# generate() is called live, mid-exam, to produce each question — unlike
# grading (a one-off background call per attempt), a hiccup here breaks a
# student's session in progress with no fallback the student can act on. A
# transient rate-limit/timeout/connection error retries with backoff instead
# of surfacing immediately; the Anthropic SDK already retries some of these
# at the HTTP layer first (max_retries=2, default), so this is a second,
# slower layer for whatever gets past that.
_MAX_GENERATE_ATTEMPTS = 3
_RETRY_BACKOFF_SECONDS = 3


def _with_retry(call: Callable[[], T], *, label: str) -> T:
    last_error: Exception | None = None
    for attempt in range(1, _MAX_GENERATE_ATTEMPTS + 1):
        try:
            return call()
        except Exception as exc:  # noqa: BLE001 — provider-agnostic (httpx vs. anthropic SDK errors)
            last_error = exc
            if attempt < _MAX_GENERATE_ATTEMPTS:
                logger.warning(
                    "LLM generate() call (%s) failed on attempt %d/%d: %s — retrying in %ds",
                    label,
                    attempt,
                    _MAX_GENERATE_ATTEMPTS,
                    exc,
                    _RETRY_BACKOFF_SECONDS * attempt,
                )
                time.sleep(_RETRY_BACKOFF_SECONDS * attempt)
    assert last_error is not None
    raise last_error


def _log_claude_usage(call_type: str, model: str, input_tokens: int, output_tokens: int) -> None:
    """Best-effort audit log for the instructor cost dashboard (see
    routers/dashboard.py). Runs in its own short-lived session so a logging
    failure can never break the actual exam/grading call it's logging —
    audit visibility is secondary to the feature working."""
    try:
        from app.db.session import SessionLocal
        from app.models.api_usage import ApiUsageLog
        from app.services.pricing import estimate_claude_cost_usd

        db = SessionLocal()
        try:
            db.add(
                ApiUsageLog(
                    provider="claude",
                    call_type=call_type,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    estimated_cost_usd=estimate_claude_cost_usd(model, input_tokens, output_tokens),
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to log Claude API usage for cost audit")


def _log_gemini_usage(call_type: str, model: str, input_tokens: int) -> None:
    """Same best-effort audit logging as Claude's, for Gemini embedding
    calls. input_tokens here is a character-based estimate, not an exact
    count — see _gemini_embed."""
    try:
        from app.db.session import SessionLocal
        from app.models.api_usage import ApiUsageLog
        from app.services.pricing import estimate_gemini_cost_usd

        db = SessionLocal()
        try:
            db.add(
                ApiUsageLog(
                    provider="gemini",
                    call_type=call_type,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=0,
                    estimated_cost_usd=estimate_gemini_cost_usd(model, input_tokens),
                )
            )
            db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to log Gemini API usage for cost audit")


class LLMProvider(ABC):
    @abstractmethod
    def embed(self, texts: list[str], usage_label: str = "embedding") -> list[list[float]]: ...

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system: str | None = None,
        cacheable_system: str | None = None,
        max_tokens: int = 2048,
        usage_label: str = "other",
    ) -> str:
        """`cacheable_system` is instructions/content that's identical across
        many calls within the same exam (e.g. the system prompt plus the
        instructor's answer key) — on providers that support it (Claude),
        this is marked as a cache breakpoint so repeated question-generation
        calls in the same exam re-read it from cache instead of re-billing
        it in full every time. `system` is for anything that still needs to
        be system-level but genuinely varies call to call, so it's never
        cached. Providers without caching (Ollama) just concatenate both."""
        ...


def _ollama_embed(texts: list[str], embed_model: str) -> list[list[float]]:
    vectors = []
    with httpx.Client(base_url=OLLAMA_BASE_URL, timeout=60.0) as client:
        for text in texts:
            res = client.post("/api/embeddings", json={"model": embed_model, "prompt": text})
            res.raise_for_status()
            vectors.append(res.json()["embedding"])
    return vectors


def _gemini_embed(texts: list[str], api_key: str, model: str, usage_label: str = "embedding") -> list[list[float]]:
    """Production embeddings — one batchEmbedContents call for every chunk
    instead of Ollama's per-text loop, since Gemini's batch endpoint takes
    the whole list in a single request. Vectors come back in request order.
    outputDimensionality is pinned to match Ollama's fixed nomic-embed-text
    width (see models/submission_chunk.EMBEDDING_DIM) — the pgvector column
    is a single fixed width, so dev (Ollama) and prod (Gemini) have to
    agree on it regardless of which one actually wrote a given row."""
    with httpx.Client(base_url=GEMINI_BASE_URL, timeout=60.0) as client:
        res = client.post(
            f"/models/{model}:batchEmbedContents",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={
                "requests": [
                    {
                        "model": f"models/{model}",
                        "content": {"parts": [{"text": text}]},
                        "outputDimensionality": EMBEDDING_DIM,
                    }
                    for text in texts
                ]
            },
        )
        res.raise_for_status()
        vectors = [e["values"] for e in res.json()["embeddings"]]

    # Gemini's embed API doesn't return token usage in the response (unlike
    # Claude's response.usage), so this is a ~4-chars-per-token estimate —
    # good enough for a directional cost audit, not exact billing.
    estimated_input_tokens = sum(len(t) for t in texts) // 4
    _log_gemini_usage(usage_label, model, estimated_input_tokens)
    return vectors


class OllamaProvider(LLMProvider):
    def __init__(self, embed_model: str = "nomic-embed-text", chat_model: str = "llama3.1"):
        self.embed_model = embed_model
        self.chat_model = chat_model

    def embed(self, texts: list[str], usage_label: str = "embedding") -> list[list[float]]:
        # Local and free — nothing to log, same as generate() below.
        return _ollama_embed(texts, self.embed_model)

    def generate(
        self,
        prompt: str,
        system: str | None = None,
        cacheable_system: str | None = None,
        max_tokens: int = 2048,
        usage_label: str = "other",
    ) -> str:
        # Ollama runs locally — nothing to log, there's no API spend, and no
        # caching concept — the two system parts just get concatenated.
        payload = {
            "model": self.chat_model,
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": max_tokens},
        }
        combined_system = "\n\n".join(s for s in (cacheable_system, system) if s)
        if combined_system:
            payload["system"] = combined_system

        def _call() -> str:
            with httpx.Client(base_url=OLLAMA_BASE_URL, timeout=120.0) as client:
                res = client.post("/api/generate", json=payload)
                res.raise_for_status()
                return res.json()["response"]

        return _with_retry(_call, label=f"ollama:{usage_label}")


class ClaudeProvider(LLMProvider):
    """Text generation via the Claude API. Anthropic has no embeddings
    endpoint, so embeddings go through Gemini when settings.gemini_api_key
    is set (production), falling back to the locally-run Ollama model
    otherwise (dev default — matches prior behavior exactly when no Gemini
    key is configured). These are two different vector spaces, so whichever
    one indexed a chunk is the only one that can meaningfully search it —
    switching providers means re-indexing Chroma from scratch, not a live
    migration."""

    def __init__(self, api_key: str, model: str, embed_model: str = "nomic-embed-text"):
        self._client = Anthropic(api_key=api_key)
        self.model = model
        self.embed_model = embed_model

    def embed(self, texts: list[str], usage_label: str = "embedding") -> list[list[float]]:
        if settings.gemini_api_key:
            return _gemini_embed(texts, settings.gemini_api_key, settings.gemini_embed_model, usage_label)
        return _ollama_embed(texts, self.embed_model)

    def generate(
        self,
        prompt: str,
        system: str | None = None,
        cacheable_system: str | None = None,
        max_tokens: int = 2048,
        usage_label: str = "other",
    ) -> str:
        kwargs: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            # This model uses extended thinking by default. These are short,
            # structured JSON-generation tasks (exam questions, grading) that
            # don't need deep reasoning — and on a short prompt, thinking can
            # silently consume the entire max_tokens budget before any
            # visible output is written, returning empty text (observed:
            # stop_reason="max_tokens" with zero TextBlocks). Disabling it
            # makes output reliable regardless of prompt/transcript length.
            "thinking": {"type": "disabled"},
            "messages": [{"role": "user", "content": prompt}],
        }
        if cacheable_system or system:
            # A list of blocks (not a plain string) is required to attach
            # cache_control to just the stable part — the dynamic part, if
            # any, is a separate, uncached block appended after it.
            system_blocks = []
            if cacheable_system:
                system_blocks.append(
                    {"type": "text", "text": cacheable_system, "cache_control": {"type": "ephemeral"}}
                )
            if system:
                system_blocks.append({"type": "text", "text": system})
            kwargs["system"] = system_blocks

        def _call() -> str:
            response = self._client.messages.create(**kwargs)
            # Cached tokens are billed/reported separately from
            # response.usage.input_tokens (cache writes cost more per
            # token, cache reads cost much less) — summed here so the audit
            # log's token count stays accurate once caching is in play,
            # even though estimate_claude_cost_usd's flat per-million rate
            # then slightly overstates cost on a cache hit rather than
            # understating it (see its own note: estimated, not exact
            # billing).
            total_input_tokens = (
                response.usage.input_tokens
                + (response.usage.cache_creation_input_tokens or 0)
                + (response.usage.cache_read_input_tokens or 0)
            )
            _log_claude_usage(usage_label, self.model, total_input_tokens, response.usage.output_tokens)
            return "".join(block.text for block in response.content if block.type == "text")

        return _with_retry(_call, label=f"claude:{usage_label}")


llm_provider: LLMProvider = (
    ClaudeProvider(api_key=settings.claude_api_key, model=settings.claude_model)
    if settings.claude_api_key
    else OllamaProvider()
)
