from typing import List, Literal
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Mono
    MONO_SECRET_KEY: str = Field(default="", repr=False)
    MONO_BASE_URL: str = "https://api.withmono.com"
    MONO_WEBHOOK_SECRET: str = Field(default="", repr=False)

    # Prembly
    PREMBLY_SECRET_KEY: str = Field(default="", repr=False)
    PREMBLY_APP_ID: str = ""
    PREMBLY_WEBHOOK_SECRET: str = Field(default="", repr=False)
    PREMBLY_BASE_URL: str = "https://api.prembly.com"
    PREMBLY_CHECKS_ENABLED: bool = False
    MONO_CREDIT_CHECKS_ENABLED: bool = False
    MONO_IDENTITY_CHECKS_ENABLED: bool = False

    SCREENING_V2_CONSENT_VERSION: str = "2026-10-28-packages-v2"
    SCREENING_V2_ENABLED: bool = False
    SCREENING_IDENTITY_MODE: Literal["mono", "manual"] = "mono"

    # App
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:3000"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = Field(default="", repr=False)
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="", repr=False)
    TENANT_LINK_SIGNING_KEY: str = Field(default="", repr=False)
    PAYSTACK_SECRET_KEY: str = Field(default="", repr=False)
    PAYMENT_PROVIDER: str = "paystack"
    FLW_SECRET_KEY: str = Field(default="", repr=False)
    FLW_WEBHOOK_SECRET: str = Field(default="", repr=False)
    PAYMENT_CALLBACK_URL: str = "http://localhost:3000/dashboard?tab=verify-tenant"
    PUBLIC_APP_URL: str = "http://localhost:3000"
    SCREENING_CONSENT_VERSION: str = "2026-10-02"
    IDENTITY_VERIFICATION_PRICE_NGN: int = 3000
    IDENTITY_CONSENT_VERSION: str = "2026-10-25"
    SCREENING_PRICES_CONFIRMED: bool = False
    ENCRYPTION_KEY: str = Field(default="", repr=False)
    HASH_PEPPER: str = Field(default="", repr=False)
    LIVENESS_PROVIDER: str = "manual_review"
    DATA_RETENTION_DAYS: int = 30
    VERIFICATION_POLICY_VERSION: str = "2026-10-25"
    VERIFICATION_STORAGE_BUCKET: str = "verification-evidence"
    VERIFICATION_JOB_SECRET: str = Field(default="", repr=False)
    AFFORDABILITY_PASS_RATIO: str = "0.40"
    AFFORDABILITY_REVIEW_RATIO: str = "0.50"

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


# Reload triggered for MONO_IDENTITY_CHECKS_ENABLED update
settings = Settings()
