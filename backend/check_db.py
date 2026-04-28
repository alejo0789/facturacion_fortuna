import asyncio
from database import SessionLocal
import models
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        res = await db.execute(select(models.Oficina).where(models.Oficina.cod_oficina.in_(['700007', '700013', '700001'])))
        print([o.cod_oficina for o in res.scalars().all()])

if __name__ == '__main__':
    asyncio.run(main())
