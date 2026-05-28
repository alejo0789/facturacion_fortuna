import asyncio
from database import SessionLocal
from sqlalchemy import select
from models import CategoriaUsuario, ModuloAccesoUsuario, Categoria

async def main():
    async with SessionLocal() as session:
        # Check module access
        res = await session.execute(select(ModuloAccesoUsuario.email))
        mod_users = res.scalars().all()
        print("--- Usuarios con acceso al Módulo ---")
        for u in mod_users:
            print(u)
            
        # Check category access
        res = await session.execute(
            select(Categoria.nombre, CategoriaUsuario.email)
            .join(CategoriaUsuario)
        )
        cat_users = res.all()
        print("\n--- Usuarios con acceso a Categorías ---")
        for cat, email in cat_users:
            print(f"{cat}: {email}")

asyncio.run(main())
