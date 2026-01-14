"""
Diagnostico detallado: mostrar valor de cada oficina con pago y ver cual falta en el reporte.
"""
import asyncio
from database import engine
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import and_, extract
import models

async def diagnosticar():
    async with AsyncSession(engine) as db:
        # Buscar TODAS las facturas PAGADAS de enero 2026
        facturas_result = await db.execute(
            select(models.Factura)
            .options(
                selectinload(models.Factura.proveedor),
                selectinload(models.Factura.oficinas_asignadas).selectinload(models.FacturaOficina.oficina)
            )
            .filter(
                models.Factura.estado == 'PAGADA',
                extract('year', models.Factura.fecha_factura) == 2026,
                extract('month', models.Factura.fecha_factura) == 1
            )
        )
        facturas = facturas_result.scalars().all()
        
        print(f"\n========== FACTURAS PAGADAS ENERO 2026 ==========")
        print(f"Total facturas: {len(facturas)}")
        
        # Calcular totales
        total_pagado = 0
        total_con_contrato = 0
        total_sin_contrato = 0
        
        oficinas_detalle = []
        
        for f in facturas:
            proveedor_id = f.proveedor_id
            proveedor_nombre = f.proveedor.nombre if f.proveedor else "Sin proveedor"
            
            if f.oficinas_asignadas:
                for fo in f.oficinas_asignadas:
                    valor = float(fo.valor) if fo.valor else 0
                    total_pagado += valor
                    oficina_id = fo.oficina_id
                    oficina_nombre = fo.oficina.nombre if fo.oficina else "Sin oficina"
                    
                    # Verificar si tiene contrato
                    contrato_result = await db.execute(
                        select(models.Contrato)
                        .filter(
                            and_(
                                models.Contrato.proveedor_id == proveedor_id,
                                models.Contrato.oficina_id == oficina_id
                            )
                        )
                    )
                    contrato = contrato_result.scalar_one_or_none()
                    
                    tiene_contrato = "SI" if contrato else "NO"
                    if contrato:
                        total_con_contrato += valor
                    else:
                        total_sin_contrato += valor
                    
                    oficinas_detalle.append({
                        'factura': f.numero_factura,
                        'proveedor_id': proveedor_id,
                        'oficina_id': oficina_id,
                        'oficina_nombre': oficina_nombre,
                        'valor': valor,
                        'tiene_contrato': tiene_contrato
                    })
        
        # Mostrar detalles
        print(f"\n========== DETALLE POR OFICINA ==========")
        for item in sorted(oficinas_detalle, key=lambda x: x['tiene_contrato']):
            print(f"   [{item['tiene_contrato']}] Factura {item['factura']} | {item['oficina_nombre']} | Valor: {item['valor']}")
        
        print(f"\n========== RESUMEN ==========")
        print(f"TOTAL PAGADO: ${total_pagado:,.2f}")
        print(f"TOTAL CON CONTRATO (aparece en reporte): ${total_con_contrato:,.2f}")
        print(f"TOTAL SIN CONTRATO (NO aparece en reporte): ${total_sin_contrato:,.2f}")
        print(f"DIFERENCIA: ${total_pagado - total_con_contrato:,.2f}")

if __name__ == "__main__":
    asyncio.run(diagnosticar())
