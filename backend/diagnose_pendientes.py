# -*- coding: utf-8 -*-
"""
Script para diagnosticar el problema de facturas pendientes
"""

import asyncio
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, '.')
from database import SessionLocal
from models import FacturaOficina, Factura, Contrato
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import extract, and_
from datetime import date

async def main():
    today = date.today()
    year = today.year
    month = today.month
    
    print(f"=" * 70)
    print(f"DIAGNOSTICO DE FACTURAS PENDIENTES")
    print(f"Fecha actual: {today}")
    print(f"=" * 70)
    
    async with SessionLocal() as db:
        # 1. Ver todas las FacturaOficina recientes
        print("\n1. ULTIMAS 10 ASIGNACIONES FacturaOficina:")
        print("-" * 70)
        result = await db.execute(
            select(FacturaOficina)
            .options(selectinload(FacturaOficina.factura), selectinload(FacturaOficina.contrato))
            .order_by(FacturaOficina.id.desc())
            .limit(10)
        )
        factura_oficinas = result.scalars().all()
        
        for fo in factura_oficinas:
            factura = fo.factura
            print(f"  FO.id={fo.id} | factura_id={fo.factura_id} | contrato_id={fo.contrato_id}")
            if factura:
                print(f"       fecha_factura={factura.fecha_factura} | fecha_created_at={factura.created_at}")
            print()
        
        # 2. Ver las facturas con contrato_id asignado en FacturaOficina para este mes
        print(f"\n2. CONTRATOS CON FACTURA ESTE MES ({month}/{year}):")
        print("-" * 70)
        
        invoiced_query = (
            select(FacturaOficina)
            .join(Factura)
            .options(selectinload(FacturaOficina.factura), selectinload(FacturaOficina.contrato))
            .filter(
                and_(
                    extract('year', Factura.fecha_factura) == year,
                    extract('month', Factura.fecha_factura) == month,
                    FacturaOficina.contrato_id.isnot(None)
                )
            )
        )
        
        result = await db.execute(invoiced_query)
        invoiced = result.scalars().all()
        print(f"  Total: {len(invoiced)} asignaciones")
        for fo in invoiced:
            print(f"    contrato_id={fo.contrato_id} | fecha_factura={fo.factura.fecha_factura if fo.factura else 'N/A'}")
        
        # 3. Ver contratos activos
        print(f"\n3. CONTRATOS ACTIVOS:")
        print("-" * 70)
        result = await db.execute(
            select(Contrato).filter(
                and_(
                    Contrato.estado == 'ACTIVO',
                    Contrato.proveedor_id.isnot(None),
                    Contrato.oficina_id.isnot(None)
                )
            )
        )
        contratos_activos = result.scalars().all()
        print(f"  Total contratos activos con proveedor y oficina: {len(contratos_activos)}")
        
        # 4. Ver facturas sin fecha_factura
        print(f"\n4. FACTURAS SIN fecha_factura:")
        print("-" * 70)
        result = await db.execute(
            select(Factura)
            .filter(Factura.fecha_factura.is_(None))
            .order_by(Factura.id.desc())
            .limit(10)
        )
        sin_fecha = result.scalars().all()
        print(f"  Total: {len(sin_fecha)}")
        for f in sin_fecha:
            print(f"    factura_id={f.id} | numero={f.numero_factura} | created_at={f.created_at}")

asyncio.run(main())
