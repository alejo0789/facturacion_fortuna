"""
Limpieza periódica de tablas de seguridad:
  - rate_limit_events  : GC lazy en cada request, pero conviene un sweep
                         nocturno para no depender del tráfico.
  - token_blacklist    : borrar jtis cuyo `expires_at` ya pasó.
  - audit_log          : NO se limpia. Es append-only por diseño.

Uso:
  a) Background task en el lifespan de FastAPI (main.py) — cada 6h.
  b) Standalone script `scripts/cleanup_security.py` para cron.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models_security import RateLimitEvent, TokenBlacklist

logger = logging.getLogger(__name__)


async def sweep_rate_limit_events(db: AsyncSession, keep_hours: int = 2) -> int:
    """Borra intentos rate-limit anteriores a `keep_hours` horas.

    Devuelve cuántas filas borró.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=keep_hours)
    result = await db.execute(
        delete(RateLimitEvent).where(RateLimitEvent.attempted_at < cutoff)
    )
    return result.rowcount or 0


async def sweep_token_blacklist(db: AsyncSession) -> int:
    """Borra tokens revocados cuya expiración ya pasó (ya no sirven)."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        delete(TokenBlacklist).where(TokenBlacklist.expires_at < now)
    )
    return result.rowcount or 0


async def run_sweep(session_maker: async_sessionmaker) -> dict:
    """Corre un ciclo completo de cleanup y devuelve conteos."""
    async with session_maker() as db:
        rl = await sweep_rate_limit_events(db)
        bl = await sweep_token_blacklist(db)
        await db.commit()
    logger.info("security cleanup: %d rate_limit_events, %d token_blacklist", rl, bl)
    return {"rate_limit_events_removed": rl, "token_blacklist_removed": bl}


async def periodic_cleanup_task(session_maker: async_sessionmaker,
                                 interval_seconds: int = 6 * 60 * 60) -> None:
    """Loop que corre `run_sweep` cada `interval_seconds` — se lanza como
    asyncio.create_task() desde el lifespan de main.py."""
    while True:
        try:
            await run_sweep(session_maker)
        except Exception:
            logger.exception("periodic_cleanup_task failed — retry en próximo ciclo")
        await asyncio.sleep(interval_seconds)
