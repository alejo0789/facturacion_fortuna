import asyncio
from database import engine as async_engine
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func, and_, or_
import models

async def check_comcel():
    async_session = async_sessionmaker(async_engine, expire_on_commit=False)
    async with async_session() as db:
        # Buscar el proveedor COMCEL
        result = await db.execute(
            select(models.Proveedor).filter(models.Proveedor.nit == '800153993')
        )
        comcel = result.scalar_one_or_none()
        
        if not comcel:
            print("COMCEL no encontrado")
            return
        
        print(f"Proveedor: {comcel.nombre} (ID: {comcel.id}, NIT: {comcel.nit})")
        
        # Buscar las oficinas mencionadas
        for cod in ['165016', '149009']:
            of_result = await db.execute(
                select(models.Oficina).filter(models.Oficina.cod_oficina == cod)
            )
            oficina = of_result.scalar_one_or_none()
            if oficina:
                print(f"\nOficina: {oficina.nombre} (ID: {oficina.id}, cod: {oficina.cod_oficina})")
                
                # Buscar contratos para esta oficina y proveedor
                contratos_result = await db.execute(
                    select(models.Contrato)
                    .filter(
                        models.Contrato.proveedor_id == comcel.id,
                        models.Contrato.oficina_id == oficina.id
                    )
                )
                contratos = contratos_result.scalars().all()
                print(f"  Contratos encontrados: {len(contratos)}")
                for c in contratos:
                    print(f"    Contrato ID={c.id}, num={c.num_contrato}, valor_mensual={c.valor_mensual}")
                
                # Buscar FacturaOficina para esta oficina
                fo_result = await db.execute(
                    select(models.FacturaOficina)
                    .options(selectinload(models.FacturaOficina.factura))
                    .filter(models.FacturaOficina.oficina_id == oficina.id)
                    .join(models.Factura)
                    .filter(models.Factura.proveedor_id == comcel.id)
                )
                fos = fo_result.scalars().all()
                print(f"  FacturaOficinas: {len(fos)}")
                total = 0
                for fo in fos:
                    print(f"    FO ID={fo.id}, factura_id={fo.factura_id}, valor={fo.valor}, factura_num={fo.factura.numero_factura if fo.factura else 'N/A'}, fecha={fo.factura.fecha_factura if fo.factura else 'N/A'}")
                    total += float(fo.valor or 0)
                print(f"  Total FacturaOficina.valor: ${total:,.0f}")

asyncio.run(check_comcel())
