from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ANALYTICS_", extra="ignore")
    internal_token: SecretStr = Field(min_length=32)
    mongo_uri: SecretStr
    mongo_database: str = Field(default="greenalert_analytics", pattern=r"^[a-zA-Z0-9_]{1,60}$")
    mongo_timeout_ms: int = Field(default=2000, ge=100, le=10000)
    cpu_workers: int = Field(default=2, ge=1, le=4)
    max_cpu_jobs: int = Field(default=2, ge=1, le=4)
    compute_timeout_seconds: float = Field(default=30, ge=0.01, le=120)
    max_body_bytes: int = Field(default=8_000_000, ge=1024, le=12_000_000)
