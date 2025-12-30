import asyncio
from sqlalchemy import text
from database import engine

async def run_migration():
    print("[INFO] Aplicando migracion para IVA y Retefuente...")
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tiene_iva VARCHAR(10) DEFAULT 'no';"))
        await conn.execute(text("ALTER TABLE contratos ADD COLUMN IF NOT EXISTS tiene_retefuente VARCHAR(10) DEFAULT 'no';"))
        await conn.execute(text("ALTER TABLE contratos ADD COLUMN IF NOT EXISTS retefuente_pct DECIMAL(5, 2);"))
    print("[SUCCESS] Migracion completada.")

if __name__ == "__main__":
    asyncio.run(run_migration())
