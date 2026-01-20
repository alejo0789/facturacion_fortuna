"""
Script para borrar oficinas con cod_oficina = '0'
Primero borra las referencias en factura_oficinas, luego las oficinas
"""
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
from dotenv import load_dotenv

load_dotenv()

# Database connection
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/facturacion")

async def delete_oficinas_zero():
    """Delete oficinas with cod_oficina = '0'"""
    
    # Create async engine
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        try:
            print("="*60)
            print("BORRAR OFICINAS CON CODIGO '0'")
            print("="*60)
            
            # Paso 1: Contar oficinas con código '0'
            print("\nPaso 1: Verificando oficinas con codigo '0'...")
            count_query = text("SELECT COUNT(*) FROM oficinas WHERE cod_oficina = '0'")
            result = await session.execute(count_query)
            count_zero = result.scalar()
            print(f"  Oficinas encontradas: {count_zero}")
            
            if count_zero == 0:
                print("\n[OK] No hay oficinas con codigo '0' para borrar.")
                return
            
            # Paso 2: Contar referencias en factura_oficinas
            print("\nPaso 2: Verificando referencias en factura_oficinas...")
            check_refs_query = text("""
                SELECT COUNT(*) FROM factura_oficinas fo
                JOIN oficinas o ON fo.oficina_id = o.id
                WHERE o.cod_oficina = '0'
            """)
            result = await session.execute(check_refs_query)
            refs_count = result.scalar()
            print(f"  Referencias encontradas: {refs_count}")
            
            # Paso 3: Borrar referencias en factura_oficinas
            if refs_count > 0:
                print(f"\nPaso 3: Borrando {refs_count} referencias en factura_oficinas...")
                delete_refs_query = text("""
                    DELETE FROM factura_oficinas 
                    WHERE oficina_id IN (
                        SELECT id FROM oficinas WHERE cod_oficina = '0'
                    )
                """)
                result = await session.execute(delete_refs_query)
                deleted_refs = result.rowcount
                print(f"  [OK] Referencias borradas: {deleted_refs}")
            else:
                print("\nPaso 3: No hay referencias para borrar.")
            
            # Paso 4: Borrar oficinas con código '0'
            print(f"\nPaso 4: Borrando oficinas con codigo '0'...")
            delete_oficinas_query = text("DELETE FROM oficinas WHERE cod_oficina = '0'")
            result = await session.execute(delete_oficinas_query)
            deleted_oficinas = result.rowcount
            print(f"  [OK] Oficinas borradas: {deleted_oficinas}")
            
            # Commit
            await session.commit()
            
            print("\n" + "="*60)
            print("RESUMEN")
            print("="*60)
            print(f"[OK] Referencias borradas: {refs_count}")
            print(f"[OK] Oficinas borradas: {deleted_oficinas}")
            print("="*60)
            
        except Exception as e:
            await session.rollback()
            print(f"\n[ERROR] {e}")
            raise
        finally:
            await engine.dispose()

if __name__ == "__main__":
    asyncio.run(delete_oficinas_zero())
