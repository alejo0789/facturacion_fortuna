import asyncio
from sqlalchemy import select, update
from database import SessionLocal
from models import Factura

async def clean_urls():
    print("Conectando a la base de datos para limpiar URLs...")
    async with SessionLocal() as session:
        # Buscar todas las facturas
        result = await session.execute(select(Factura).where(Factura.url_factura != None))
        facturas = result.scalars().all()
        
        updates = 0
        for f in facturas:
            if f.url_factura:
                # Comprobar si hay espacios o saltos de línea al principio o al final
                original_url = f.url_factura
                clean_url = original_url.strip()
                
                if original_url != clean_url:
                    await session.execute(
                        update(Factura)
                        .where(Factura.id == f.id)
                        .values(url_factura=clean_url)
                    )
                    updates += 1
                    print(f"Factura ID {f.id} corregida.")
        
        # Guardar los cambios
        if updates > 0:
            await session.commit()
            print(f"¡Éxito! Se corrigieron {updates} facturas en total.")
        else:
            print("No se encontraron facturas con saltos de línea o espacios extra.")

if __name__ == "__main__":
    asyncio.run(clean_urls())
