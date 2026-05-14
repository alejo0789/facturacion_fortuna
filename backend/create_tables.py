from database import engine, Base
import models
import models_contabilidad

import asyncio

async def main():
    print("Creating tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Done!")

asyncio.run(main())
