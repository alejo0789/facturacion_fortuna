"""
Script para borrar los contratos insertados incorrectamente
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def delete_contratos():
    """Delete recently inserted contracts"""
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            print("="*60)
            print("BORRAR CONTRATOS DE OFICINAS 001 Y 010")
            print("="*60)
            
            # Borrar contratos de oficinas 001 y 010
            delete_query = text("""
                DELETE FROM contratos 
                WHERE oficina_id IN (
                    SELECT id FROM oficinas WHERE cod_oficina IN ('001', '010')
                )
            """)
            result = await session.execute(delete_query)
            deleted = result.rowcount
            
            await session.commit()
            
            print(f"\n[OK] Contratos borrados: {deleted}")
            print("="*60)
            
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(delete_contratos())
