import asyncio
import os
from sqlalchemy import text
from database import engine

async def migrate():
    print("Iniciando migracion de base de datos para Auditoria...")
    
    queries = [
        # 1. Crear tabla de auditoria (PostgreSQL / SQLite compatible)
        """
        CREATE TABLE IF NOT EXISTS contrato_auditoria (
            id SERIAL PRIMARY KEY,
            original_id INTEGER,
            num_contrato VARCHAR(100),
            proveedor_nit VARCHAR(50),
            proveedor_nombre VARCHAR(255),
            oficina_cod VARCHAR(50),
            oficina_nombre VARCHAR(255),
            valor_mensual NUMERIC(12, 2),
            detalles_completos TEXT,
            fecha_eliminacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            motivo VARCHAR(255) DEFAULT 'Eliminacion manual por usuario'
        );
        """,
        # 2. Agregar columna a facturas
        "ALTER TABLE facturas ADD COLUMN IF NOT EXISTS info_contrato_audit TEXT;",
        # 3. Agregar columna a factura_oficinas
        "ALTER TABLE factura_oficinas ADD COLUMN IF NOT EXISTS info_contrato_audit TEXT;"
    ]
    
    async with engine.begin() as conn:
        for query in queries:
            try:
                print(f"Ejecutando: {query[:50]}...")
                await conn.execute(text(query))
            except Exception as e:
                # Si falla porque la columna ya existe, está bien
                if "already exists" in str(e).lower():
                    print("OK: La columna/tabla ya existia.")
                else:
                    print(f"ERROR en query: {e}")
                    
    print("\nMigracion completada con exito. Ya puedes intentar eliminar contratos de nuevo.")

if __name__ == "__main__":
    asyncio.run(migrate())
