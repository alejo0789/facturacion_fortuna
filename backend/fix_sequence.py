"""
Script para resetear la secuencia de IDs de la tabla oficinas
Esto soluciona el error de "llave duplicada"
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def fix_sequence():
    """Reset the oficinas ID sequence"""
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            print("="*60)
            print("RESETEAR SECUENCIA DE IDs DE OFICINAS")
            print("="*60)
            
            # Ver el máximo ID actual
            max_id_query = text("SELECT MAX(id) FROM oficinas")
            result = await session.execute(max_id_query)
            max_id = result.scalar() or 0
            print(f"\nID maximo actual en la tabla: {max_id}")
            
            # Resetear la secuencia al siguiente valor
            next_id = max_id + 1
            reset_query = text(f"SELECT setval('oficinas_id_seq', {next_id}, false)")
            await session.execute(reset_query)
            
            print(f"Secuencia reseteada. Proximo ID sera: {next_id}")
            
            await session.commit()
            
            print("\n[OK] Secuencia corregida exitosamente")
            print("="*60)
            
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(fix_sequence())
