from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Mono
    MONO_SECRET_KEY: str = ""
    MONO_BASE_URL: str = "https://api.withmono.com"
    MONO_WEBHOOK_SECRET: str = ""

    # Prembly
    PREMBLY_SECRET_KEY: str = ""
    PREMBLY_APP_ID: str = ""
    PREMBLY_WEBHOOK_SECRET: str = ""
    PREMBLY_BASE_URL: str = "https://api.prembly.com"
    PREMBLY_CHECKS_ENABLED: bool = False
    MONO_CREDIT_CHECKS_ENABLED: bool = False
    MONO_IDENTITY_CHECKS_ENABLED: bool = False

    # App
    PORT: int = 8000
    HOST: str = "0.0.0.0"
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    TENANT_LINK_SIGNING_KEY: str = ""
    RESEND_API_KEY: str = ""
    SCREENING_NOTIFICATION_FROM_EMAIL: str = ""
    PAYSTACK_SECRET_KEY: str = ""
    PAYMENT_PROVIDER: str = "paystack"
    FLW_SECRET_KEY: str = ""
    FLW_WEBHOOK_SECRET: str = ""
    PAYMENT_CALLBACK_URL: str = "http://localhost:3000/dashboard?tab=verify-tenant"
    PUBLIC_APP_URL: str = "http://localhost:3000"
    SCREENING_CONSENT_VERSION: str = "2026-10-02"
    IDENTITY_VERIFICATION_PRICE_NGN: int = 3000
    IDENTITY_CONSENT_VERSION: str = "2026-10-12"
    SCREENING_PRICES_CONFIRMED: bool = False

    @property
    def cors_origins(self) -> List[str]:
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
