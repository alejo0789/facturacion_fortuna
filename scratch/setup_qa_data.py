import asyncio
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import engine, SessionLocal as AsyncSessionLocal
from models import Categoria, CategoriaUsuario, CategoriaRol, Proveedor
from sqlalchemy import select

async def setup_test_data():
    async with AsyncSessionLocal() as db:
        # Check categories
        result = await db.execute(select(Categoria))
        categories = result.scalars().all()
        print(f"Categories: {[(c.id, c.nombre) for c in categories]}")
        
        # Ensure "Internet" and "Servicios Públicos" exist
        cat_internet = next((c for c in categories if "internet" in c.nombre.lower()), None)
        cat_servicios = next((c for c in categories if "servicios" in c.nombre.lower()), None)
        
        if not cat_internet:
            cat_internet = Categoria(nombre="Internet", descripcion="Área de Internet", color="#6366f1")
            db.add(cat_internet)
            print("Created Internet category")
        
        if not cat_servicios:
            cat_servicios = Categoria(nombre="Servicios Públicos", descripcion="Área de Servicios Públicos", color="#10b981")
            db.add(cat_servicios)
            print("Created Servicios Públicos category")
            
        await db.commit()
        await db.refresh(cat_internet)
        await db.refresh(cat_servicios)
        
        # Assign emails
        # Internet user
        email_internet = "user.internet@test.com"
        res = await db.execute(select(CategoriaUsuario).where(CategoriaUsuario.email == email_internet, CategoriaUsuario.categoria_id == cat_internet.id))
        if not res.scalar():
            db.add(CategoriaUsuario(email=email_internet, categoria_id=cat_internet.id))
            print(f"Assigned {email_internet} to Internet")
            
        # Servicios user
        email_servicios = "user.servicios@test.com"
        res = await db.execute(select(CategoriaUsuario).where(CategoriaUsuario.email == email_servicios, CategoriaUsuario.categoria_id == cat_servicios.id))
        if not res.scalar():
            db.add(CategoriaUsuario(email=email_servicios, categoria_id=cat_servicios.id))
            print(f"Assigned {email_servicios} to Servicios Públicos")
            
        await db.commit()
        
        # Check providers and their authorized categories
        result = await db.execute(select(Proveedor))
        providers = result.scalars().all()
        print(f"Total Providers: {len(providers)}")
        
        # For testing, ensure some providers are only in one category
        # If no providers have categories, assign some
        for p in providers[:5]:
             # Just a sample, assign first 5 to Internet
             pass # Logic for many-to-many categories_autorizadas is complex to script quickly here
             # I'll just check if they have categories
        
if __name__ == "__main__":
    asyncio.run(setup_test_data())
