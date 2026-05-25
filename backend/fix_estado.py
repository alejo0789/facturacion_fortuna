import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def update_db():
    engine = create_async_engine('postgresql+asyncpg://postgres:root@localhost:5432/supplier_db')
    async with engine.begin() as conn:
        res = await conn.execute(text("UPDATE facturas SET estado = 'EN_TRAMITE' WHERE estado = 'PENDIENTE' AND observaciones LIKE '%DC%'"))
        print(f'Actualizadas {res.rowcount} facturas.')

asyncio.run(update_db())
