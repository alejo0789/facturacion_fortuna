import asyncio
import os
from database import engine
from sqlalchemy import text

async def add_status_updated_at_column():
    print("Adding status_updated_at column to facturas table...")
    async with engine.begin() as conn:
        try:
            # Check if column exists
            result = await conn.execute(text(
                "SELECT column_name FROM information_schema.columns WHERE table_name='facturas' AND column_name='status_updated_at'"
            ))
            if result.fetchone():
                print("Column status_updated_at already exists.")
            else:
                await conn.execute(text("ALTER TABLE facturas ADD COLUMN status_updated_at TIMESTAMP"))
                print("Column status_updated_at added successfully.")
        except Exception as e:
            print(f"Error adding column: {e}")

if __name__ == "__main__":
    asyncio.run(add_status_updated_at_column())
