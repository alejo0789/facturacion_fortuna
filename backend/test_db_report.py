import asyncio
from database import engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
import models

async def test_data():
    async with AsyncSession(engine) as db:
        # Check total number of facturas
        total_facturas = await db.execute(select(func.count(models.Factura.id)))
        print(f"Total Facturas in DB: {total_facturas.scalar()}")
        
        # Check distinct status
        statuses = await db.execute(select(models.Factura.estado, func.count(models.Factura.id)).group_by(models.Factura.estado))
        print("\nStatuses of Facturas:")
        for status, count in statuses.all():
            print(f"  {status}: {count}")
            
        # Check facturas for April/May 2026
        # Let's see some invoices with their dates and statuses
        facturas_april = await db.execute(
            select(models.Factura.id, models.Factura.fecha_factura, models.Factura.estado, models.Factura.categoria_id)
            .filter(models.Factura.fecha_factura >= '2026-04-01')
            .filter(models.Factura.fecha_factura <= '2026-05-31')
            .limit(10)
        )
        print("\nFacturas in April/May 2026:")
        rows = facturas_april.all()
        print(f"Total found in date range: {len(rows)}")
        for fid, ffecha, festado, fcat in rows:
            print(f"  ID: {fid} | Date: {ffecha} | Estado: {festado} | Categoria: {fcat}")

        # Check a few random facturas to see their dates
        random_facturas = await db.execute(
            select(models.Factura.id, models.Factura.fecha_factura, models.Factura.estado, models.Factura.categoria_id)
            .order_by(models.Factura.id.desc())
            .limit(10)
        )
        print("\nRecent 10 Facturas in DB:")
        for fid, ffecha, festado, fcat in random_facturas.all():
            print(f"  ID: {fid} | Date: {ffecha} | Estado: {festado} | Categoria: {fcat}")

if __name__ == "__main__":
    asyncio.run(test_data())
