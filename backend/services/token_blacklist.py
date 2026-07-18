"""
Revocación de JWTs por `jti` — soporte para logout, cambio de contraseña,
cierre remoto de sesiones.

Diseño:

  1. Cada token creado en `core.security.create_access_token()` /
     `create_refresh_token()` recibe un claim `jti` (UUID hex de 32 chars).

  2. `revoke_token(db, jti, expires_at, reason)` inserta el jti en la tabla
     `token_blacklist`.

  3. `get_current_user` consulta la blacklist en cada request. Para no
     martillar Postgres, hay un cache en memoria por proceso con TTL corto
     — un token revocado se vuelve efectivamente inválido en máximo
     `_CACHE_TTL_SECONDS` segundos.

  4. Cleanup: opportunistically borramos filas ya expiradas al leer.

Notas de escala:
- El cache in-memory desincroniza brevemente entre workers, pero
  `_CACHE_TTL_SECONDS = 30s` es aceptable — un JWT de attacker sirve como
  mucho 30 segundos extra tras logout.
- Para revocación con menor lag, poner el cache TTL a 5s (más queries a
  Postgres) o migrar a Redis pub/sub.
"""
from __future__ import annotations

import random
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models_security import TokenBlacklist


_CACHE_TTL_SECONDS = 30
_GC_PROB = 0.05

# jti → epoch_seconds when this cache entry expires
_local_cache: dict[str, float] = {}
# jtis conocidos como revocados (los mantenemos hasta que su token real expire)
_known_revoked: set[str] = set()


def _cache_get_status(jti: str) -> Optional[bool]:
    """Devuelve True si sabemos que está revocado, False si sabemos que NO
    lo está, None si no hemos verificado recientemente."""
    if jti in _known_revoked:
        return True
    expires_at = _local_cache.get(jti)
    if expires_at is None:
        return None
    if time.time() > expires_at:
        _local_cache.pop(jti, None)
        return None
    return False


def _cache_mark_valid(jti: str) -> None:
    _local_cache[jti] = time.time() + _CACHE_TTL_SECONDS


def _cache_mark_revoked(jti: str) -> None:
    _known_revoked.add(jti)
    _local_cache.pop(jti, None)


async def is_revoked(db: AsyncSession, jti: str) -> bool:
    """True si el jti fue revocado. False si no."""
    if not jti:
        return False

    cached = _cache_get_status(jti)
    if cached is not None:
        return cached

    result = await db.execute(
        select(TokenBlacklist).where(TokenBlacklist.jti == jti)
    )
    entry = result.scalar_one_or_none()

    if entry is None:
        _cache_mark_valid(jti)
        return False

    # Si el jti está en blacklist pero ya expiró de todas formas, lo tratamos
    # como no-revocado (el propio JWT expiraría solo) y aprovechamos para
    # limpiarlo.
    if entry.expires_at and entry.expires_at < datetime.now(timezone.utc):
        try:
            await db.execute(
                delete(TokenBlacklist).where(TokenBlacklist.jti == jti)
            )
        except Exception:
            pass
        _cache_mark_valid(jti)
        return False

    _cache_mark_revoked(jti)
    return True


async def revoke_token(
    db: AsyncSession,
    jti: str,
    expires_at: datetime,
    reason: str = "logout",
) -> None:
    """Marca un jti como revocado. Idempotente (no falla si ya está)."""
    if not jti:
        return

    existing = (await db.execute(
        select(TokenBlacklist).where(TokenBlacklist.jti == jti)
    )).scalar_one_or_none()

    if existing:
        _cache_mark_revoked(jti)
        return

    db.add(TokenBlacklist(
        jti=jti,
        expires_at=expires_at,
        reason=reason[:100],
    ))
    await db.flush()

    _cache_mark_revoked(jti)

    if random.random() < _GC_PROB:
        try:
            await db.execute(
                delete(TokenBlacklist).where(
                    TokenBlacklist.expires_at < datetime.now(timezone.utc)
                )
            )
        except Exception:
            pass
