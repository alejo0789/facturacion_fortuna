import asyncio
from database import engine as async_engine
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.future import select
from sqlalchemy import func, and_, or_, cast, Date
from datetime import date
import models

async def check_data():
    async_session = async_sessionmaker(async_engine, expire_on_commit=False)
    async with async_session() as db:
        # Check facturas with fecha_factura
        result1 = await db.execute(
            select(
                func.min(models.Factura.fecha_factura),
                func.max(models.Factura.fecha_factura),
                func.count(models.Factura.id)
            ).filter(models.Factura.fecha_factura.isnot(None))
        )
        row1 = result1.first()
        print(f'Facturas con fecha_factura: {row1[2]} (min: {row1[0]}, max: {row1[1]})')
        
        # Check facturas without fecha_factura (using created_at)
        result2 = await db.execute(
            select(
                func.min(models.Factura.created_at),
                func.max(models.Factura.created_at),
                func.count(models.Factura.id)
            ).filter(models.Factura.fecha_factura.is_(None))
        )
        row2 = result2.first()
        print(f'Facturas sin fecha_factura (usan created_at): {row2[2]} (min: {row2[0]}, max: {row2[1]})')
        
        # Check total by year
        for year in [2024, 2025, 2026]:
            start_y = date(year, 1, 1)
            end_y = date(year, 12, 31)
            result_y = await db.execute(
                select(func.sum(models.FacturaOficina.valor))
                .join(models.Factura)
                .filter(
                    or_(
                        and_(
                            models.Factura.fecha_factura.isnot(None),
                            models.Factura.fecha_factura >= start_y,
                            models.Factura.fecha_factura <= end_y
                        ),
                        and_(
                            models.Factura.fecha_factura.is_(None),
                            cast(models.Factura.created_at, Date) >= start_y,
                            cast(models.Factura.created_at, Date) <= end_y
                        )
                    )
                )
            )
            total_y = result_y.scalar() or 0
            print(f'Total {year}: {total_y:,.0f}')
        
        # Check Enero 2026 specifically
        start_jan = date(2026, 1, 1)
        end_jan = date(2026, 1, 31)
        result_jan = await db.execute(
            select(func.sum(models.FacturaOficina.valor))
            .join(models.Factura)
            .filter(
                or_(
                    and_(
                        models.Factura.fecha_factura.isnot(None),
                        models.Factura.fecha_factura >= start_jan,
                        models.Factura.fecha_factura <= end_jan
                    ),
                    and_(
                        models.Factura.fecha_factura.is_(None),
                        cast(models.Factura.created_at, Date) >= start_jan,
                        cast(models.Factura.created_at, Date) <= end_jan
                    )
                )
            )
        )
        total_jan = result_jan.scalar() or 0
        print(f'Total Enero 2026: {total_jan:,.0f}')
        
        # Total without any date filter
        result_all = await db.execute(
            select(func.sum(models.FacturaOficina.valor))
        )
        total_all = result_all.scalar() or 0
        print(f'Total FacturaOficina (SIN filtro de fecha): {total_all:,.0f}')
        
        # Check Factura.valor directly (no FacturaOficina)
        result_factura = await db.execute(
            select(func.sum(models.Factura.valor))
        )
        total_factura = result_factura.scalar() or 0
        print(f'Total Factura.valor (directo, sin filtro): {total_factura:,.0f}')
        
        # Check if any Factura has estado='PAGADA' and dates
        result_pagadas = await db.execute(
            select(
                models.Factura.id,
                models.Factura.numero_factura,
                models.Factura.valor,
                models.Factura.fecha_factura,
                models.Factura.created_at,
                models.Factura.estado
            ).filter(models.Factura.estado == 'PAGADA')
        )
        pagadas = result_pagadas.all()
        print(f'\nFacturas PAGADAS: {len(pagadas)}')
        for f in pagadas[:5]:
            print(f'  ID={f[0]}, num={f[1]}, valor={f[2]}, fecha={f[3]}, created={f[4]}, estado={f[5]}')

asyncio.run(check_data())
