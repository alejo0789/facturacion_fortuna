"""
Schemas Pydantic para gestión de Empresas (tenants).
"""
from pydantic import BaseModel
from typing import Optional


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
