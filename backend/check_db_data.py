
import asyncio
from sqlalchemy import select, func
from database import SessionLocal
import models
from datetime import datetime

async def check_data():
    async with SessionLocal() as db:
        # Total facturas
        res = await db.execute(select(func.count(models.Factura.id)))
        total = res.scalar()
        
        # Facturas por estado
        res = await db.execute(select(models.Factura.estado, func.count(models.Factura.id)).group_by(models.Factura.estado))
        estados = res.all()
        
        # Facturas por año
        res = await db.execute(select(func.extract('year', models.Factura.fecha_factura), func.count(models.Factura.id)).group_by(func.extract('year', models.Factura.fecha_factura)))
        años = res.all()
        
        # Facturas por categoria
        res = await db.execute(select(models.Categoria.nombre, func.count(models.Factura.id)).join(models.Categoria).group_by(models.Categoria.nombre))
        cats = res.all()

        print(f"TOTAL FACTURAS: {total}")
        print(f"ESTADOS: {estados}")
        print(f"AÑOS: {años}")
        print(f"CATEGORIAS: {cats}")

if __name__ == "__main__":
    asyncio.run(check_data())
