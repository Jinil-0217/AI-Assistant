from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str = ""
    supabase_url: str = ""
    supabase_key: str = ""

    embedding_model: str = "text-embedding-004"
    llm_model: str = "gemini-3.8-flash"

    chunk_size: int = 800
    chunk_overlap: int = 150
    top_k: int = 5
    similarity_threshold: float = 0.35
    max_context_tokens: int = 4000
    temperature: float = 0.2
    max_upload_size_bytes: int = 5 * 1024 * 1024  # 5 MB

    cors_origins: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
