
import asyncio
from database import SessionLocal
import models
from sqlalchemy import select

async def check():
    async with SessionLocal() as db:
        res = await db.execute(select(models.Categoria.id, models.Categoria.nombre))
        print(f"CATEGORIAS EN DB: {res.all()}")

if __name__ == "__main__":
    asyncio.run(check())
