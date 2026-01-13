import asyncio
from database import engine as async_engine
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.future import select
from sqlalchemy import func, and_, or_, cast, Date
from datetime import date
import models

async def check_pagadas():
    async_session = async_sessionmaker(async_engine, expire_on_commit=False)
    async with async_session() as db:
        # Total facturas PAGADAS 2026
        start_2026 = date(2026, 1, 1)
        end_2026 = date(2026, 12, 31)
        
        result = await db.execute(
            select(func.sum(models.FacturaOficina.valor))
            .join(models.Factura)
            .filter(
                models.Factura.estado == 'PAGADA',
                or_(
                    and_(
                        models.Factura.fecha_factura.isnot(None),
                        models.Factura.fecha_factura >= start_2026,
                        models.Factura.fecha_factura <= end_2026
                    ),
                    and_(
                        models.Factura.fecha_factura.is_(None),
                        cast(models.Factura.created_at, Date) >= start_2026,
                        cast(models.Factura.created_at, Date) <= end_2026
                    )
                )
            )
        )
        total = result.scalar() or 0
        print(f'Total PAGADO 2026: ${total:,.0f}')
        
        # Listar facturas pagadas 2026
        result2 = await db.execute(
            select(
                models.Factura.id,
                models.Factura.numero_factura,
                models.Factura.valor,
                models.Factura.fecha_factura,
                models.Factura.estado
            ).filter(
                models.Factura.estado == 'PAGADA',
                or_(
                    and_(
                        models.Factura.fecha_factura.isnot(None),
                        models.Factura.fecha_factura >= start_2026,
                        models.Factura.fecha_factura <= end_2026
                    ),
                    and_(
                        models.Factura.fecha_factura.is_(None),
                        cast(models.Factura.created_at, Date) >= start_2026,
                        cast(models.Factura.created_at, Date) <= end_2026
                    )
                )
            )
        )
        facturas = result2.all()
        print(f'\nFacturas PAGADAS en 2026: {len(facturas)}')
        total_f = 0
        for f in facturas:
            print(f'  ID={f[0]}, num={f[1]}, valor=${f[2]:,.0f}, fecha={f[3]}')
            total_f += float(f[2] or 0)
        print(f'\nSuma total Factura.valor: ${total_f:,.0f}')

asyncio.run(check_pagadas())
