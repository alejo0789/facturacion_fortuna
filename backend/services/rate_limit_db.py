"""
Rate limiter multi-worker basado en Postgres.

Reemplaza al `middleware/rate_limiter.py` (in-memory) para endpoints que
requieren garantía de límite compartido entre workers de uvicorn/gunicorn.

Modelo: ventana deslizante. Cada intento inserta 1 fila; el chequeo es un
`COUNT(*)` sobre la ventana. GC opportuno borra rows viejas.

Uso:

    from services.rate_limit_db import check_rate_limit

    async def login(...):
        await check_rate_limit(
            db, bucket=f"login:ip:{client_ip}",
            max_attempts=5, window_seconds=15*60,
            error_msg="Demasiados intentos de login",
        )
        # ...

    async def logout(...):
        # No rate-limitado, pero llama a `record_success()` para limpiar
        # la ventana si el login tuvo éxito.
        pass

Notas:
- No usa contadores atómicos — cada request hace 1 INSERT + 1 SELECT COUNT.
  Para 60 req/min por usuario esto es despreciable (~2 QPS por usuario).
- GC lazy: 1 de cada N inserts limpia rows expiradas para no requerir cron.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from models_security import RateLimitEvent


# Cada ~50 requests, hacemos GC de eventos ya fuera de la mayor ventana.
_GC_PROB = 0.02
_GC_MAX_RETENTION_SECONDS = 24 * 60 * 60  # 1 día


async def _maybe_gc(db: AsyncSession) -> None:
    if random.random() > _GC_PROB:
        return
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=_GC_MAX_RETENTION_SECONDS)
    await db.execute(
        delete(RateLimitEvent).where(RateLimitEvent.attempted_at < cutoff)
    )
    # No commit — se commitea con el resto de la transacción.


async def check_rate_limit(
    db: AsyncSession,
    bucket: str,
    max_attempts: int,
    window_seconds: int,
    *,
    error_msg: str = "Demasiadas peticiones",
    record: bool = True,
) -> None:
    """Cuenta intentos recientes en el bucket. Si supera `max_attempts`,
    lanza HTTP 429.

    Si `record=True`, además inserta el intento actual (default para endpoints
    de auth). Con `record=False` solo hace check (útil para endpoints que
    hacen el registro dentro de la lógica de negocio, ej. tras validar
    credenciales).
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=window_seconds)

    result = await db.execute(
        select(func.count(RateLimitEvent.id)).where(
            RateLimitEvent.bucket == bucket,
            RateLimitEvent.attempted_at > cutoff,
        )
    )
    attempts = int(result.scalar_one())

    if attempts >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail=f"{error_msg}. Intenta en {window_seconds // 60 + 1} minutos.",
        )

    if record:
        db.add(RateLimitEvent(bucket=bucket, attempted_at=now))
        await db.flush()

    await _maybe_gc(db)


async def clear_bucket(db: AsyncSession, bucket: str) -> None:
    """Borra todos los eventos de un bucket. Se usa tras un login exitoso
    para no acumular attempts fallidos previos."""
    await db.execute(
        delete(RateLimitEvent).where(RateLimitEvent.bucket == bucket)
    )
    await db.flush()
