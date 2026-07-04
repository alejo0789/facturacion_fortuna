"""
Schemas Pydantic para gestión de Empresas (tenants).
"""
from datetime import datetime
from pydantic import BaseModel, Field
from typing import Optional, Literal


class EmpresaCreate(BaseModel):
    nombre: str
    nombre_comercial: Optional[str] = None
    nit: str
    digito_verificacion: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    representante_legal: Optional[str] = None
    regimen_tributario: str = "Regimen Ordinario"


class EmpresaUpdate(BaseModel):
    nombre: Optional[str] = None
    nombre_comercial: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    representante_legal: Optional[str] = None
    regimen_tributario: Optional[str] = None
    responsable_iva: Optional[bool] = None

    oracle_host: Optional[str] = None
    oracle_port: Optional[int] = None
    oracle_service: Optional[str] = None
    oracle_user: Optional[str] = None
    oracle_password_enc: Optional[str] = None
    oracle_enabled: Optional[bool] = None

    n8n_webhook_url: Optional[str] = None
    n8n_search_webhook: Optional[str] = None
    n8n_process_webhook: Optional[str] = None

    storage_type: Optional[str] = None
    storage_path: Optional[str] = None
    ftp_host: Optional[str] = None
    ftp_port: Optional[int] = None
    ftp_user: Optional[str] = None
    ftp_password_enc: Optional[str] = None

    sidebar_title: Optional[str] = None
    sidebar_subtitle: Optional[str] = None
    external_system_name: Optional[str] = None
    external_system_url: Optional[str] = None
    logo_url: Optional[str] = None


class EmpresaResponse(BaseModel):
    id: int
    firma_id: int
    nombre: str
    nombre_comercial: Optional[str] = None
    nit: str
    digito_verificacion: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    representante_legal: Optional[str] = None
    regimen_tributario: Optional[str] = None
    activa: bool
    api_key: Optional[str] = None

    n8n_webhook_url: Optional[str] = None
    n8n_search_webhook: Optional[str] = None
    n8n_process_webhook: Optional[str] = None

    sidebar_title: Optional[str] = None
    sidebar_subtitle: Optional[str] = None
    external_system_name: Optional[str] = None
    external_system_url: Optional[str] = None
    logo_url: Optional[str] = None

    storage_type: Optional[str] = None
    storage_path: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Integraciones n8n + IA + correo ──────────────────────────────────────
EmailProvider = Literal["outlook", "gmail", "yahoo", "imap"]


class IntegracionesResponse(BaseModel):
    """Estado de las integraciones n8n + IA + correo de la empresa activa.

    El campo `mode` indica si la empresa usa el workflow compartido del SaaS
    (default) o tiene su propia instancia n8n self-hosted. Los `effective_*_url`
    son las URLs que el backend realmente usará al disparar webhooks.
    """

    # validation_alias="id" → al construir desde el modelo SQLAlchemy Empresa
    # (que usa .id como primary key) Pydantic mapea automáticamente a empresa_id.
    # El frontend sigue recibiendo el campo como empresa_id en el JSON.
    empresa_id: int = Field(..., validation_alias="id")
    api_key: Optional[str] = None
    storage_path: Optional[str] = None

    # Override per-tenant (opcional). Si están vacíos, el backend usa los
    # shared del SaaS.
    n8n_webhook_url: Optional[str] = None  # upload manual de PDF
    n8n_search_webhook: Optional[str] = None  # búsqueda de correos (fase 2)
    n8n_process_webhook: Optional[str] = None  # procesar adjuntos (fase 2)

    # Credenciales n8n (IDs) — siempre per-tenant
    n8n_credential_openai_id: Optional[str] = None
    n8n_credential_email_id: Optional[str] = None
    n8n_email_provider: Optional[EmailProvider] = None

    # Estado del último test
    n8n_webhook_last_test: Optional[datetime] = None
    n8n_webhook_last_status: Optional[Literal["ok", "error"]] = None

    # Modo de operación + URLs resueltas
    mode: Literal["saas_managed", "self_hosted"] = "saas_managed"
    shared_process_url: Optional[str] = None
    shared_search_url: Optional[str] = None
    effective_process_url: Optional[str] = None
    effective_search_url: Optional[str] = None

    model_config = {"from_attributes": True}


class IntegracionesUpdate(BaseModel):
    """Payload para PUT /empresas/me/integraciones (parcial)."""

    n8n_webhook_url: Optional[str] = Field(None, max_length=500)
    n8n_search_webhook: Optional[str] = Field(None, max_length=500)
    n8n_process_webhook: Optional[str] = Field(None, max_length=500)
    n8n_credential_openai_id: Optional[str] = Field(None, max_length=100)
    n8n_credential_email_id: Optional[str] = Field(None, max_length=100)
    n8n_email_provider: Optional[EmailProvider] = None
    storage_path: Optional[str] = Field(None, max_length=500)


class IntegracionesTestResult(BaseModel):
    """Resultado de probar el webhook de procesamiento."""

    ok: bool
    status_code: Optional[int] = None
    message: str
    elapsed_ms: Optional[int] = None
