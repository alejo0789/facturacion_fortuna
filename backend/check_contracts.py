
import asyncio
from sqlalchemy import select, func
from database import SessionLocal
import models

async def check_contracts():
    async with SessionLocal() as db:
        # Total contratos
        res = await db.execute(select(func.count(models.Contrato.id)))
        total = res.scalar()
        
        # Contratos sin categoria
        res = await db.execute(select(func.count(models.Contrato.id)).where(models.Contrato.categoria_id == None))
        sin_cat = res.scalar()
        
        # Contratos por categoria
        res = await db.execute(
            select(models.Categoria.nombre, func.count(models.Contrato.id))
            .join(models.Categoria, models.Contrato.categoria_id == models.Categoria.id)
            .group_by(models.Categoria.nombre)
        )
        cats = res.all()

        print(f"TOTAL CONTRATOS: {total}")
        print(f"CONTRATOS SIN CATEGORIA: {sin_cat}")
        print(f"CONTRATOS POR CATEGORIA: {cats}")

if __name__ == "__main__":
    asyncio.run(check_contracts())
