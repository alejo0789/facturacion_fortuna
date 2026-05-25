
import asyncio
from sqlalchemy import select, func
from database import SessionLocal
import models

async def check_values():
    async with SessionLocal() as db:
        # Suma total en FacturaOficina para facturas PAGADAS
        res = await db.execute(
            select(func.sum(models.FacturaOficina.valor))
            .join(models.Factura, models.FacturaOficina.factura_id == models.Factura.id)
            .filter(models.Factura.estado == 'PAGADA')
        )
        total = res.scalar()
        
        # Conteo de registros en FacturaOficina
        res = await db.execute(select(func.count(models.FacturaOficina.id)))
        count_details = res.scalar()

        print(f"SUMA VALORES PAGADOS (Detalle): {total}")
        print(f"TOTAL REGISTROS DETALLE: {count_details}")

if __name__ == "__main__":
    asyncio.run(check_values())
