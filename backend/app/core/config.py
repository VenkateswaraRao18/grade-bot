from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    elevenlabs_api_key: str | None = None
    elevenlabs_voice_id: str | None = None
    claude_api_key: str | None = None
    claude_model: str = "claude-sonnet-5"
    # Production embeddings — set this to move off the local-only Ollama
    # path (see llm_provider.py). Unset in dev, where Ollama stays the
    # default. A different embedding model is a different vector space, so
    # switching this means re-indexing everything in Chroma from scratch.
    gemini_api_key: str | None = None
    gemini_embed_model: str = "gemini-embedding-001"
    # Comma-separated list — set in production to the deployed frontend's
    # origin(s) (e.g. a Vercel domain). Defaults to local dev only.
    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
