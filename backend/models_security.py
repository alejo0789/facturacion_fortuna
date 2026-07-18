"""
Modelos SQLAlchemy para la migración 012 (hardening de seguridad).

  - RateLimitEvent : ventana deslizante multi-worker.
  - TokenBlacklist : revocación de JWTs por `jti`.
  - AuditLog       : traza append-only de acciones sensibles.

Se separan de `models_tenant.py` porque son cross-cutting (no pertenecen a
un tenant específico — aunque los eventos suelen atarse a `empresa_id`).
"""
from __future__ import annotations

from sqlalchemy import (
    Column, Integer, BigInteger, String, DateTime, ForeignKey,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from database import Base


class RateLimitEvent(Base):
    """Un intento de acción sujeto a rate limit.

    `bucket` codifica la dimensión del límite:
      "login:ip:1.2.3.4"           → login por IP
      "login:email:user@x.com"     → login por email
      "sync-dian:user:42"          → sync DIAN por usuario
      "api:user:42"                → uso general de la API
    """
    __tablename__ = "rate_limit_events"

    id = Column(BigInteger, primary_key=True, index=True)
    bucket = Column(String(200), nullable=False, index=True)
    attempted_at = Column(DateTime(timezone=True), server_default=func.now(),
                          nullable=False)


class TokenBlacklist(Base):
    """JWT invalidado antes de expirar.

    El middleware/dependencies consultan esta tabla por `jti`. `expires_at`
    permite limpiarla periódicamente cuando el token ya expiró de todas formas.
    """
    __tablename__ = "token_blacklist"

    jti = Column(String(64), primary_key=True)
    revoked_at = Column(DateTime(timezone=True), server_default=func.now(),
                        nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    reason = Column(String(100))


class AuditLog(Base):
    """Traza append-only de acciones sensibles.

    Sin FK a `usuarios` — el user_id se guarda como integer plano para que
    borrar un usuario no destruya la historia. Idem `resource_id` como
    string para soportar cualquier tipo (int, uuid, string).
    """
    __tablename__ = "audit_log"

    id = Column(BigInteger, primary_key=True, index=True)
    ts = Column(DateTime(timezone=True), server_default=func.now(),
                nullable=False, index=True)
    empresa_id = Column(
        Integer,
        ForeignKey("empresas.id", ondelete="SET NULL"),
        index=True,
    )
    user_id = Column(Integer, index=True)
    action = Column(String(80), nullable=False, index=True)
    resource_type = Column(String(80))
    resource_id = Column(String(50))
    ip = Column(String(45))
    user_agent = Column(String(500))
    result = Column(String(20), default="success")
    details = Column(JSONB)
