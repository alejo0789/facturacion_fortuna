import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.future import select
import sys
import os

# Add parent directory to path to find models
sys.path.append(os.path.join(os.getcwd(), 'backend'))
import models

async def check_office():
    # Detect if we are in backend or root
    db_path = 'fortuna_facturacion.db' if os.path.exists('fortuna_facturacion.db') else 'backend/fortuna_facturacion.db'
    engine = create_async_engine(f'sqlite+aiosqlite:///{db_path}')
    
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.ext.asyncio import AsyncSession
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Search for offices with 001 or 010 in code
        result = await session.execute(select(models.Oficina).where(
            (models.Oficina.cod_oficina.like('%001%')) | (models.Oficina.cod_oficina.like('%010%'))
        ))
        offices = result.scalars().all()
        for o in offices:
            print(f"ID: {o.id}, Cod: {o.cod_oficina}, Nombre: {o.nombre}")

if __name__ == "__main__":
    asyncio.run(check_office())
