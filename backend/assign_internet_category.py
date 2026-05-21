import asyncio
from sqlalchemy import select, update
from database import SessionLocal
from models import Categoria, Factura

async def assign_category():
    print("Conectando a la base de datos de producción...")
    async with SessionLocal() as session:
        # 1. Buscar la categoría de Internet
        # Buscamos ignorando mayúsculas/minúsculas usando like
        result = await session.execute(
            select(Categoria).where(Categoria.nombre.ilike("%internet%"))
        )
        categoria_internet = result.scalars().first()
        
        if not categoria_internet:
            print("ERROR: No se encontró ninguna categoría con el nombre 'Internet' o similar en la base de datos.")
            print("Por favor, asegúrate de haber creado la categoría desde la interfaz web primero.")
            return
            
        print(f"Categoría encontrada: '{categoria_internet.nombre}' (ID: {categoria_internet.id})")
        
        # 2. Asignar esta categoría a TODAS las facturas actuales
        # Puedes añadir una condición como `.where(Factura.categoria_id == None)` si solo quieres actualizar las vacías
        stmt = update(Factura).values(categoria_id=categoria_internet.id)
        
        result = await session.execute(stmt)
        await session.commit()
        
        print(f"¡Éxito! Se actualizaron {result.rowcount} facturas para asignarlas a la categoría '{categoria_internet.nombre}'.")

if __name__ == "__main__":
    asyncio.run(assign_category())
