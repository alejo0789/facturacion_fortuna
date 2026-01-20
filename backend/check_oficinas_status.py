"""
Script para verificar el estado actual de las oficinas
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def check_oficinas():
    """Check current state of oficinas table"""
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            print("="*60)
            print("ESTADO ACTUAL DE OFICINAS")
            print("="*60)
            
            # Contar total
            count_query = text("SELECT COUNT(*) FROM oficinas")
            result = await session.execute(count_query)
            total = result.scalar()
            print(f"\nTotal oficinas: {total}")
            
            # Ver IDs y códigos
            query = text("SELECT id, cod_oficina, nombre FROM oficinas ORDER BY id")
            result = await session.execute(query)
            oficinas = result.fetchall()
            
            print("\nOficinas existentes:")
            print("-" * 60)
            for ofi in oficinas:
                print(f"ID: {ofi[0]:3d} | Codigo: {ofi[1]:4s} | Nombre: {ofi[2]}")
            
            # Ver el valor actual de la secuencia
            seq_query = text("SELECT last_value FROM oficinas_id_seq")
            result = await session.execute(seq_query)
            seq_value = result.scalar()
            print(f"\nValor actual de la secuencia: {seq_value}")
            
            # Ver el máximo ID
            max_query = text("SELECT MAX(id) FROM oficinas")
            result = await session.execute(max_query)
            max_id = result.scalar() or 0
            print(f"ID maximo en la tabla: {max_id}")
            
            if seq_value <= max_id:
                print("\n[PROBLEMA] La secuencia esta detras del ID maximo!")
                print(f"La secuencia deberia estar en: {max_id + 1}")
            else:
                print("\n[OK] La secuencia esta correcta")
            
            print("="*60)
            
        except Exception as e:
            print(f"\n[ERROR] {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_oficinas())
