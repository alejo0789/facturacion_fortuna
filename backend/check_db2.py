import asyncio
from database import SessionLocal
import models
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        proveedor = await db.execute(select(models.Proveedor).where(models.Proveedor.nit == "1193236801"))
        proveedor = proveedor.scalar_one_or_none()
        if proveedor:
            print(f"Proveedor found: {proveedor.id}")
            facturas = await db.execute(select(models.Factura).where(
                models.Factura.proveedor_id == proveedor.id
            ))
            for f in facturas.scalars().all():
                print(f"Factura: {f.id}, Num: {f.numero_factura}, Estado: {f.estado}, Obs: {f.observaciones}")
                oficinas = await db.execute(select(models.FacturaOficina).where(models.FacturaOficina.factura_id == f.id))
                print(f"  Oficinas asignadas: {len(oficinas.scalars().all())}")

if __name__ == '__main__':
    asyncio.run(main())
