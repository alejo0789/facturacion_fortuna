"""
Modelos de identidad multi-tenant: Firma, Empresa, Usuario, UsuarioEmpresa.

Reutilizan la misma Base declarativa que models.py (importada desde
database.py) para que todas las tablas se creen en el mismo metadata.

TenantMixin se expone para que otros modelos (existentes y nuevos) puedan
heredar `empresa_id` de forma consistente.
"""
import uuid
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from database import Base


class TenantMixin:
    """Añade empresa_id a cualquier modelo para aislamiento multi-tenant.

    Se deja nullable=True para permitir la migración gradual en datos
    preexistentes (serán backfilleados con la empresa por defecto).
    """
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )


class Firma(Base):
    """Firma contadora — suscriptor del SaaS (cuenta "dueño")."""
    __tablename__ = "firmas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(255), nullable=False)
    nit = Column(String(50), unique=True, nullable=False)
    direccion = Column(String(255))
    telefono = Column(String(50))
    email = Column(String(255))
    logo_url = Column(String(500))
    plan_suscripcion = Column(String(50), default="basico")
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    empresas = relationship("Empresa", back_populates="firma")
    usuarios = relationship("Usuario", back_populates="firma")


class Empresa(Base):
    """Empresa cliente — el tenant. Una Firma puede tener N Empresas."""
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)
    firma_id = Column(Integer, ForeignKey("firmas.id"), nullable=False, index=True)

    # Identidad
    nombre = Column(String(255), nullable=False)
    nombre_comercial = Column(String(255))
    nit = Column(String(50), nullable=False)
    digito_verificacion = Column(String(5))
    direccion = Column(String(255))
    ciudad = Column(String(100))
    departamento = Column(String(100))
    telefono = Column(String(50))
    email = Column(String(255))
    representante_legal = Column(String(255))

    # Régimen fiscal
    regimen_tributario = Column(String(100), default="Regimen Ordinario")
    moneda = Column(String(10), default="COP")
    pais = Column(String(100), default="Colombia")
    responsable_iva = Column(Boolean, default=True)

    # Conexión Oracle opcional por-tenant (reemplaza vars de entorno globales)
    oracle_host = Column(String(255))
    oracle_port = Column(Integer, default=1521)
    oracle_service = Column(String(100))
    oracle_user = Column(String(100))
    oracle_password_enc = Column(Text)
    oracle_enabled = Column(Boolean, default=False)

    # Webhooks n8n configurables por empresa
    n8n_webhook_url = Column(String(500))     # upload manual de PDF
    n8n_search_webhook = Column(String(500))  # búsqueda emails (fase 2)
    n8n_process_webhook = Column(String(500)) # procesar adjuntos (fase 2)

    # IDs de credenciales en n8n. El usuario las crea en n8n una sola vez
    # y pega los IDs en su panel /app/integraciones. El workflow los lee del
    # payload y los usa como credentialId dinámico → multi-tenant.
    n8n_credential_openai_id = Column(String(100))
    n8n_credential_email_id = Column(String(100))
    n8n_email_provider = Column(String(20))  # outlook|gmail|yahoo|imap

    # OAuth Gmail multi-tenant (migración 008)
    # Modelo A (default): 'saas' → usa GOOGLE_OAUTH_CLIENT_ID/SECRET globales del backend.
    # Modelo B (avanzado): 'custom' → la empresa registró su propia OAuth app.
    gmail_oauth_mode = Column(String(10), default="saas")
    gmail_client_id = Column(String(500))                 # solo custom mode
    gmail_client_secret_enc = Column(Text)                # solo custom mode, encriptado
    gmail_refresh_token_enc = Column(Text)                # OAuth refresh token, encriptado
    gmail_email = Column(String(255))                     # correo autorizado (display)
    gmail_connected_at = Column(DateTime)

    # Gemini API key per-tenant (override opcional del GEMINI_API_KEY_GLOBAL)
    gemini_api_key_enc = Column(Text)                     # encriptado

    # OAuth Outlook multi-tenant (migración 009). Mismo patrón que Gmail.
    outlook_oauth_mode = Column(String(10), default="saas")
    outlook_client_id = Column(String(500))
    outlook_client_secret_enc = Column(Text)
    outlook_refresh_token_enc = Column(Text)
    outlook_email = Column(String(255))
    outlook_connected_at = Column(DateTime)
    outlook_tenant_id = Column(String(255), default="common")

    # Conciliación DIAN (migración 010). Cédula del representante legal
    # + sesión Playwright activa, ambas encriptadas con Fernet.
    dian_cedula_representante_enc = Column(Text)
    dian_sesion_estado_enc = Column(Text)
    dian_ultima_sync = Column(DateTime)
    dian_periodicidad = Column(String(20), default="bimestral")

    # Multi-método auth DIAN (migración 011). Ver comentarios de la migración
    # para valores permitidos. Las CONTRASEÑAS del portal DIAN NO se persisten.
    dian_metodo_auth = Column(String(30), default="persona")
    dian_tipo_id = Column(String(4), default="CC")
    dian_email_enc = Column(Text)                # solo para 'administrador'
    dian_nit_empresa_dian_enc = Column(Text)     # 'rep_legal', 'usuario_autorizado'
    dian_doc_usuario_enc = Column(Text)          # 'usuario_autorizado'

    # Estado del último test del webhook (UI)
    n8n_webhook_last_test = Column(DateTime)
    n8n_webhook_last_status = Column(String(10))  # 'ok'|'error'

    # Almacenamiento de archivos
    storage_type = Column(String(20), default="local")  # local, ftp, s3
    storage_path = Column(String(500), default="./storage/facturas")
    ftp_host = Column(String(255))
    ftp_port = Column(Integer, default=21)
    ftp_user = Column(String(100))
    ftp_password_enc = Column(Text)

    # Branding UI
    sidebar_title = Column(String(100))
    sidebar_subtitle = Column(String(100))
    external_system_name = Column(String(100))
    external_system_url = Column(String(500))
    logo_url = Column(String(500))

    # API Key propia para integraciones externas / n8n
    api_key = Column(String(100), unique=True, default=lambda: str(uuid.uuid4()))

    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    firma = relationship("Firma", back_populates="empresas")
    usuarios = relationship("UsuarioEmpresa", back_populates="empresa")


class Usuario(Base):
    """Usuario del sistema con autenticación JWT."""
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    firma_id = Column(Integer, ForeignKey("firmas.id"), nullable=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    nombre = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    es_superadmin = Column(Boolean, default=False)
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    # 2FA (TOTP) — migración 013. El secret se guarda encriptado con Fernet.
    two_factor_secret_enc = Column(Text)
    two_factor_enabled = Column(Boolean, default=False)

    firma = relationship("Firma", back_populates="usuarios")
    empresas = relationship("UsuarioEmpresa", back_populates="usuario")


class UsuarioEmpresa(Base):
    """Relación N a N usuario↔empresa con rol.

    Roles soportados: ADMIN, CONTADOR, AUDITOR, FACTURACION, CONTABILIDAD,
    PRODUCTOS, VENTAS, SOLO_LECTURA.
    """
    __tablename__ = "usuario_empresa"

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"), nullable=False)
    rol = Column(String(50), nullable=False, default="SOLO_LECTURA")

    __table_args__ = (
        UniqueConstraint("usuario_id", "empresa_id", name="uq_usuario_empresa"),
    )

    usuario = relationship("Usuario", back_populates="empresas")
    empresa = relationship("Empresa", back_populates="usuarios")
