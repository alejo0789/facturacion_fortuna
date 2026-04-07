import asyncio
import os
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Import models from the current directory
import sys
sys.path.append(os.getcwd())
from models import Proveedor, ProveedorFeedback

async def check_and_delete_feedback(nit: str):
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("Error: DATABASE_URL not found in .env")
        return

    engine = create_async_engine(database_url)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as session:
        # Find the proveedor ID
        stmt = select(Proveedor).where(Proveedor.nit == nit)
        result = await session.execute(stmt)
        proveedor = result.scalar_one_or_none()

        if not proveedor:
            print(f"No se encontró el proveedor con NIT: {nit}")
            return

        print(f"Proveedor: {proveedor.nombre} (ID: {proveedor.id})")

        # Count feedback entries
        stmt_count = select(ProveedorFeedback).where(ProveedorFeedback.proveedor_id == proveedor.id)
        result_count = await session.execute(stmt_count)
        feedbacks = result_count.scalars().all()
        
        count = len(feedbacks)
        print(f"Se encontraron {count} entradas de feedback para este proveedor.")

        if count > 0:
            for f in feedbacks:
                print(f"- [{f.created_at}] {f.descripcion[:100]}...")
            
            # Confirm deletion
            confirm = input(f"\n¿Estás SEGURO de que quieres eliminar estas {count} entradas? (SI/no): ")
            if confirm == "SI":
                stmt_delete = delete(ProveedorFeedback).where(ProveedorFeedback.proveedor_id == proveedor.id)
                await session.execute(stmt_delete)
                await session.commit()
                print("Eliminación completada exitosamente.")
            else:
                print("Operación cancelada.")
        else:
            print("No hay feedback que eliminar.")

    await engine.dispose()

if __name__ == "__main__":
    NIT_TO_DELETE = "901073256"
    asyncio.run(check_and_delete_feedback(NIT_TO_DELETE))
