import asyncio
from sqlalchemy import text
from database import engine

async def run_migration():
    with open('migrations/add_proveedor_categorias.sql', 'r', encoding='utf-8') as f:
        sql = f.read()

    print("Executing migration...")
    async with engine.begin() as conn:
        for statement in sql.split(';'):
            statement = statement.strip()
            if statement:
                print(f"Executing: {statement[:50]}...")
                await conn.execute(text(statement))
    
    print("Migration completed!")

if __name__ == "__main__":
    asyncio.run(run_migration())
