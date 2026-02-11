import asyncio
import os
from sqlalchemy import update
from database import engine, SessionLocal
from models import Factura

async def fix_urls():
    # Invoices to fix: { numero_factura: new_url }
    to_fix = {
        "580831421034": r"\\192.168.2.20\Facturas\febrero\5\RepGrafica_580831421034.pdf",
        "BEC505068640": r"\\192.168.2.20\Facturas\febrero\5\RepGrafica_BEC505068640.pdf"
    }
    
    print(f"Connecting to database...")
    async with SessionLocal() as session:
        async with session.begin():
            for num_fac, new_url in to_fix.items():
                print(f"Updating Factura #{num_fac}...")
                stmt = (
                    update(Factura)
                    .where(Factura.numero_factura == num_fac)
                    .values(url_factura=new_url)
                )
                result = await session.execute(stmt)
                
                if result.rowcount > 0:
                    print(f"  [OK] Updated {result.rowcount} row(s).")
                else:
                    print(f"  [WARNING] No record found with numero_factura: {num_fac}")
            
        await session.commit()
    print("\nProcess finished.")

if __name__ == "__main__":
    asyncio.run(fix_urls())
