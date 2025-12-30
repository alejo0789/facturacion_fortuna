import asyncio
from database import SessionLocal
import models
from sqlalchemy import delete

async def cleanup_data():
    """
    Elimina todas las facturas y contratos actuales (datos de ejemplo).
    Tambien limpia las tablas relacionadas para evitar errores de llave foranea.
    """
    print("[INFO] Iniciando limpieza de datos de ejemplo...")
    
    async with SessionLocal() as db:
        try:
            # Orden de eliminacion para respetar llaves foraneas:
            # 1. FacturaOficina y Pagos (dependen de Factura/Contrato)
            # 2. Facturas (dependen de Contrato/Proveedor)
            # 3. Contratos (dependen de Proveedor/Oficina)
            
            print("   - Eliminando registros en factura_oficinas...")
            await db.execute(delete(models.FacturaOficina))
            
            print("   - Eliminando registros en pagos...")
            await db.execute(delete(models.Pago))
            
            print("   - Eliminando registros en facturas...")
            await db.execute(delete(models.Factura))
            
            print("   - Eliminando registros en contratos...")
            await db.execute(delete(models.Contrato))
            
            await db.commit()
            print("[SUCCESS] Limpieza completada con exito.")
            
        except Exception as e:
            print(f"[ERROR] Error durante la limpieza: {e}")
            await db.rollback()

if __name__ == "__main__":
    asyncio.run(cleanup_data())
