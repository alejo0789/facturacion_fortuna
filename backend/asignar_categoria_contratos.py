"""
Asignar categoria 'Internet' a todos los contratos que tienen categoria_id = NULL.
Ejecutar en producción SOLO UNA VEZ.
"""
import asyncio
from sqlalchemy import select, update, func
from database import SessionLocal
from models import Categoria, Contrato, Factura

async def diagnostico_y_asignacion():
    async with SessionLocal() as session:
        # =========================================================
        # 1. DIAGNÓSTICO GENERAL
        # =========================================================
        print("\n========== DIAGNÓSTICO ==========")
        
        # Categorias existentes
        cats = await session.execute(select(Categoria.id, Categoria.nombre))
        categorias = cats.all()
        print(f"Categorías en DB: {categorias}")
        
        # Contratos sin categoria
        c_null = await session.execute(
            select(func.count(Contrato.id)).where(Contrato.categoria_id.is_(None))
        )
        c_con = await session.execute(
            select(func.count(Contrato.id)).where(Contrato.categoria_id.isnot(None))
        )
        print(f"Contratos SIN categoria: {c_null.scalar()}")
        print(f"Contratos CON categoria: {c_con.scalar()}")
        
        # Facturas sin categoria
        f_null = await session.execute(
            select(func.count(Factura.id)).where(Factura.categoria_id.is_(None))
        )
        f_con = await session.execute(
            select(func.count(Factura.id)).where(Factura.categoria_id.isnot(None))
        )
        f_pagadas = await session.execute(
            select(func.count(Factura.id)).where(Factura.estado == 'PAGADA')
        )
        print(f"Facturas SIN categoria: {f_null.scalar()}")
        print(f"Facturas CON categoria: {f_con.scalar()}")
        print(f"Facturas PAGADAS (total): {f_pagadas.scalar()}")
        
        # =========================================================
        # 2. BUSCAR CATEGORÍA INTERNET
        # =========================================================
        result = await session.execute(
            select(Categoria).where(Categoria.nombre.ilike("%internet%"))
        )
        cat_internet = result.scalars().first()
        
        if not cat_internet:
            print("\n❌ ERROR: No se encontró categoría 'Internet'. Créala primero desde la interfaz.")
            return
        
        print(f"\n✅ Categoría Internet encontrada: ID={cat_internet.id}, Nombre='{cat_internet.nombre}'")
        
        # =========================================================
        # 3. ASIGNAR A CONTRATOS SIN CATEGORÍA
        # =========================================================
        stmt = update(Contrato).where(
            Contrato.categoria_id.is_(None)
        ).values(categoria_id=cat_internet.id)
        
        result = await session.execute(stmt)
        await session.commit()
        print(f"\n✅ Se actualizaron {result.rowcount} contratos con categoría 'Internet'")
        
        # =========================================================
        # 4. ASIGNAR A FACTURAS SIN CATEGORÍA (si las hay)
        # =========================================================
        stmt2 = update(Factura).where(
            Factura.categoria_id.is_(None)
        ).values(categoria_id=cat_internet.id)
        
        result2 = await session.execute(stmt2)
        await session.commit()
        print(f"✅ Se actualizaron {result2.rowcount} facturas con categoría 'Internet'")
        
        print("\n========== LISTO ==========")
        print("Ahora todos los contratos y facturas tienen la categoría Internet asignada.")

if __name__ == "__main__":
    asyncio.run(diagnostico_y_asignacion())
