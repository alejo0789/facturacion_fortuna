"""
Schemas Pydantic para autenticación.

Archivo flat (no paquete) para convivir con `schemas.py` existente
sin romper imports actuales.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterRequest(BaseModel):
    # Firma
    firma_nombre: str
    firma_nit: str

    # Primer usuario (ADMIN)
    email: EmailStr
    nombre: str
    password: str

    # Primera empresa (opcional)
    empresa_nombre: Optional[str] = None
    empresa_nit: Optional[str] = None


class RefreshRequest(BaseModel):
    refresh_token: str


class UserInfo(BaseModel):
    id: int
    email: str
    nombre: str
    es_superadmin: bool

    model_config = {"from_attributes": True}


class EmpresaInfo(BaseModel):
    id: int
    nombre: str
    nombre_comercial: Optional[str] = None
    nit: str
    rol: str
    logo_url: Optional[str] = None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserInfo
    empresas: list[EmpresaInfo]


class UserCreate(BaseModel):
    email: EmailStr
    nombre: str
    password: str


class UserUpdate(BaseModel):
    nombre: Optional[str] = None
    activo: Optional[bool] = None


class AssignRoleRequest(BaseModel):
    usuario_id: int
    empresa_id: int
    rol: str  # ADMIN, CONTADOR, AUDITOR, FACTURACION, CONTABILIDAD, PRODUCTOS, VENTAS, SOLO_LECTURA
