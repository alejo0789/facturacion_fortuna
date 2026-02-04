import asyncio
from sqlalchemy import select, update, delete
from database import SessionLocal
from models import Proveedor, Contrato, Factura, ProveedorFeedback

async def migrate_provider_data():
    async with SessionLocal() as db:
        old_nit = "830114921"
        new_nit = "900092385"
        
        # 1. Get IDs
        stmt_old = select(Proveedor).where(Proveedor.nit == old_nit)
        res_old = await db.execute(stmt_old)
        old_p = res_old.scalar_one_or_none()
        
        stmt_new = select(Proveedor).where(Proveedor.nit == new_nit)
        res_new = await db.execute(stmt_new)
        new_p = res_new.scalar_one_or_none()
        
        if not old_p:
            print(f"Error: Old provider with NIT {old_nit} not found.")
            return
        if not new_p:
            print(f"Error: New provider with NIT {new_nit} not found.")
            return
            
        old_id = old_p.id
        new_id = new_p.id
        
        print(f"Migrating data from {old_p.nombre} (ID: {old_id}) to {new_p.nombre} (ID: {new_id})...")
        
        # 2. Update Contratos
        stmt_upd_contratos = (
            update(Contrato)
            .where(Contrato.proveedor_id == old_id)
            .values(proveedor_id=new_id)
        )
        res_contratos = await db.execute(stmt_upd_contratos)
        print(f"Updated {res_contratos.rowcount} contratos.")
        
        # 3. Update Facturas
        stmt_upd_facturas = (
            update(Factura)
            .where(Factura.proveedor_id == old_id)
            .values(proveedor_id=new_id)
        )
        res_facturas = await db.execute(stmt_upd_facturas)
        print(f"Updated {res_facturas.rowcount} facturas.")
        
        # 4. Update ProveedorFeedback
        stmt_upd_feedback = (
            update(ProveedorFeedback)
            .where(ProveedorFeedback.proveedor_id == old_id)
            .values(proveedor_id=new_id)
        )
        res_feedback = await db.execute(stmt_upd_feedback)
        print(f"Updated {res_feedback.rowcount} feedback entries.")
        
        # 5. Delete Old Provider
        stmt_del_p = delete(Proveedor).where(Proveedor.id == old_id)
        await db.execute(stmt_del_p)
        print(f"Deleted old provider record (NIT: {old_nit}).")
        
        # 6. Commit
        await db.commit()
        print("Migration completed successfully.")

if __name__ == "__main__":
    asyncio.run(migrate_provider_data())
