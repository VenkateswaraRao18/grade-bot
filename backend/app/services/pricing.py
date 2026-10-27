"""Claude API pricing, $ per million tokens, for estimating audit-log cost.
Anthropic has no API for a key's remaining balance (unlike ElevenLabs, which
exposes subscription quota) — so this can only ever report what's been
spent, not what's left. Update when the configured model changes."""

CLAUDE_PRICING_PER_MILLION_USD: dict[str, dict[str, float]] = {
    "claude-sonnet-5": {"input": 2.00, "output": 10.00},
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
    "claude-opus-5-5": {"input": 4.00, "output": 20.00},
    "claude-opus-5": {"input": 5.00, "output": 25.00},
    "claude-haiku-5-5": {"input": 0.10, "output": 0.50},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
}


def estimate_claude_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float | None:
    """None (not 0.0) when the model isn't in the table, so an unrecognized
    model shows as "unknown" in the audit log rather than a silently wrong
    $0.00 that looks like free usage."""
    pricing = CLAUDE_PRICING_PER_MILLION_USD.get(model)
    if pricing is None:
        return None
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


# Gemini embedding pricing, $ per million input tokens (output tokens don't
# apply to embeddings). Gemini's embed API doesn't report exact token usage
# the way Claude's response.usage does, so the token count fed into this is
# itself a ~4-chars-per-token estimate — treat the resulting dollar figure
# as directional, not exact billing (flagged as such in the usage note).
GEMINI_EMBEDDING_PRICING_PER_MILLION_USD: dict[str, float] = {
    "gemini-embedding-001": 0.15,
}


def estimate_gemini_cost_usd(model: str, input_tokens: int) -> float | None:
    price = GEMINI_EMBEDDING_PRICING_PER_MILLION_USD.get(model)
    if price is None:
        return None
    return (input_tokens * price) / 1_000_000
