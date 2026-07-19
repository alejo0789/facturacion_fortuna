#!/usr/bin/env python
"""
Cleanup manual de tablas de seguridad — ejecutable desde cron.

Ejemplo cron (Linux, cada día a las 3 AM):

    0 3 * * * cd /path/to/facturacion_fortuna/backend && \
        conda run -n fortuna-saas python ../scripts/cleanup_security.py

En Windows con Task Scheduler:

    Action: Start a program
    Program: conda
    Arguments: run -n fortuna-saas python scripts/cleanup_security.py
    Start in: C:\\path\\to\\facturacion_fortuna

Se puede correr manualmente sin flags.
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

# Asegurar que se encuentra el módulo backend/
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "backend"))
os.chdir(HERE.parent / "backend")


async def main() -> None:
    from database import SessionLocal
    from services.security_cleanup import run_sweep

    result = await run_sweep(SessionLocal)
    print("Limpieza de seguridad completada:")
    for k, v in result.items():
        print(f"  - {k}: {v}")


if __name__ == "__main__":
    asyncio.run(main())
