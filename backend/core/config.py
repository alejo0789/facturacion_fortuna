"""
Centralized configuration. Loads from .env via pydantic-settings.

Nota: Esta configuración es aditiva — no reemplaza la lectura de
variables que ya hacen otros módulos (database.py, middleware/auth.py).
"""
from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import Optional


class Settings(BaseSettings):
    # ---------- Base de datos ----------
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/supplier_db"

    # ---------- JWT ----------
    JWT_SECRET_KEY: str = "CHANGE-THIS-IN-PRODUCTION"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ---------- CORS ----------
    CORS_ORIGINS: str = (
        "http://localhost:5173,http://localhost:3000,"
        "http://192.168.2.91:5173,"
        "https://saman.lafortuna.com.co,http://saman.lafortuna.com.co"
    )

    # ---------- API Key legado (n8n actual de Fortuna) ----------
    # Si está seteada, se acepta como llave global además de las llaves
    # por empresa almacenadas en la tabla empresas.api_key.
    API_KEY: Optional[str] = None

    # ---------- n8n compartido del SaaS ----------
    # Arquitectura: un solo workflow atiende a TODOS los tenants. El backend
    # envía en el payload `apiKey`, `empresaId`, `openai_credential_id` y
    # `credential_email_id` para que el workflow use credenciales dinámicas
    # (n8n soporta credentialId como expresión desde v1.x).
    #
    # Estas URLs son las del workflow compartido. Cada empresa puede sobreescribir
    # con su propia instancia n8n self-hosted en empresas.n8n_webhook_url, pero el
    # default debería ser apuntar a la instancia n8n del SaaS.
    N8N_PROCESS_WEBHOOK_URL: Optional[str] = None  # workflow procesar factura (PDF)
    N8N_SEARCH_WEBHOOK_URL: Optional[str] = None   # workflow buscar correos (fase 2)
    N8N_PROCESS_EMAIL_WEBHOOK_URL: Optional[str] = None  # workflow procesar adjunto (fase 2)

    # ---------- Superadmin semilla ----------
    SUPERADMIN_EMAIL: str = "admin@admin.com"
    SUPERADMIN_PASSWORD: str = "admin123"

    # ---------- Empresa por defecto (migración) ----------
    # Al primer arranque se crea una Firma y Empresa por defecto
    # y todas las filas existentes se backfillean con su id.
    DEFAULT_FIRMA_NOMBRE: str = "Fortuna"
    DEFAULT_FIRMA_NIT: str = "000000000-0"
    DEFAULT_EMPRESA_NOMBRE: str = "La Fortuna"
    DEFAULT_EMPRESA_NIT: str = "000000000-0"

    # ---------- Seguridad ----------
    MAX_LOGIN_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15
    MIN_PASSWORD_LENGTH: int = 8

    # ---------- App ----------
    APP_NAME: str = "Supplier Service API"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def _warn_default_jwt(cls, v: str) -> str:
        if v == "CHANGE-THIS-IN-PRODUCTION":
            import warnings
            warnings.warn(
                "JWT_SECRET_KEY está en su valor por defecto. "
                "Defina una clave aleatoria en .env antes de producción.",
                stacklevel=2,
            )
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
