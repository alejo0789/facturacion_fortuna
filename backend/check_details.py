import asyncio
from database import engine as async_engine
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import models

async def check_details():
    async_session = async_sessionmaker(async_engine, expire_on_commit=False)
    async with async_session() as db:
        # Buscar las facturas que están asignadas a las oficinas 34 y 35
        for of_id, of_name in [(34, 'MARIA OCCIDENTE'), (35, 'PANDIGUANDO')]:
            print(f"\n{'='*60}")
            print(f"Oficina ID={of_id}: {of_name}")
            print(f"{'='*60}")
            
            fo_result = await db.execute(
                select(models.FacturaOficina)
                .options(selectinload(models.FacturaOficina.factura))
                .filter(models.FacturaOficina.oficina_id == of_id)
            )
            fos = fo_result.scalars().all()
            
            print(f"Total FacturaOficinas: {len(fos)}")
            
            # Agrupar por factura
            facturas_dict = {}
            for fo in fos:
                f_id = fo.factura_id
                if f_id not in facturas_dict:
                    facturas_dict[f_id] = {
                        'numero': fo.factura.numero_factura if fo.factura else 'N/A',
                        'fecha': fo.factura.fecha_factura if fo.factura else 'N/A',
                        'proveedor_id': fo.factura.proveedor_id if fo.factura else 'N/A',
                        'valor_fo': 0,
                        'estado': fo.factura.estado if fo.factura else 'N/A'
                    }
                facturas_dict[f_id]['valor_fo'] += float(fo.valor or 0)
            
            total = 0
            for f_id, data in facturas_dict.items():
                print(f"  Factura ID={f_id}, num={data['numero']}, fecha={data['fecha']}, valor_fo=${data['valor_fo']:,.0f}, estado={data['estado']}")
                total += data['valor_fo']
            
            print(f"\nTOTAL: ${total:,.0f}")

asyncio.run(check_details())
