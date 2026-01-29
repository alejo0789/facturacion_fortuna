import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def check_oficinas():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Check offices 001 and 010
        print("Checking existing offices 001 and 010...")
        query = text("SELECT id, cod_oficina, nombre FROM oficinas WHERE cod_oficina IN ('001', '010') OR cod_oficina LIKE '001_INT_%' OR cod_oficina LIKE '010_INT_%'")
        result = await session.execute(query)
        oficinas = result.fetchall()
        
        if not oficinas:
            print("No se encontraron oficinas 001 ni 010.")
        else:
            print(f"Encontradas {len(oficinas)} oficinas:")
            ids = [o[0] for o in oficinas]
            for o in oficinas:
                print(f"ID: {o[0]}, COD: {o[1]}, NOMBRE: {o[2]}")
            
            # Check dependencies
            if ids:
                ids_str = ",".join(str(id) for id in ids)
                # Check facturas
                f_query = text(f"SELECT COUNT(*) FROM factura_oficinas WHERE oficina_id IN ({ids_str})")
                f_res = await session.execute(f_query)
                f_count = f_res.scalar()
                
                # Check contratos
                c_query = text(f"SELECT COUNT(*) FROM contratos WHERE oficina_id IN ({ids_str})")
                c_res = await session.execute(c_query)
                c_count = c_res.scalar()
                
                print(f"\nDependencias encontradas:")
                print(f"- Facturas referenciando estas oficinas: {f_count}")
                print(f"- Contratos referenciando estas oficinas: {c_count}")
        
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(check_oficinas())
