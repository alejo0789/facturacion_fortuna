"""
Script para ver los proveedores en la base de datos
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def list_proveedores():
    """List all proveedores"""
    
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            query = text("SELECT id, nit, nombre FROM proveedores ORDER BY nombre")
            result = await session.execute(query)
            proveedores = result.fetchall()
            
            print("="*60)
            print("PROVEEDORES EN LA BASE DE DATOS")
            print("="*60)
            print(f"Total: {len(proveedores)}\n")
            
            for prov in proveedores:
                print(f"ID: {prov[0]:3d} | NIT: {prov[1]:20s} | Nombre: {prov[2]}")
            
            print("="*60)
            
        except Exception as e:
            print(f"[ERROR] {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(list_proveedores())
