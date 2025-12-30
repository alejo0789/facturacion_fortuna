# -*- coding: utf-8 -*-
import asyncio
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, '.')
from database import SessionLocal
from models import Contrato
from sqlalchemy.future import select
from sqlalchemy import func

async def main():
    async with SessionLocal() as db:
        result = await db.execute(select(func.count()).select_from(Contrato))
        total = result.scalar()
        print(f"\nTotal contratos en BD: {total}")
        
        # Contratos recientes
        result = await db.execute(
            select(Contrato).order_by(Contrato.id.desc()).limit(15)
        )
        contratos = result.scalars().all()
        
        print("\nUltimos 15 contratos creados:")
        print("-" * 80)
        for c in contratos:
            print(f"ID: {c.id} | Proveedor: {c.proveedor_id} | Oficina: {c.oficina_id} | NumContrato: {c.num_contrato} | Tipo: {c.tipo}")

asyncio.run(main())
