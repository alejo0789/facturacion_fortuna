from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()


def _normalize_database_url(url: str) -> str:
    """Convierte el formato que dan Railway/Heroku (`postgresql://` con
    driver default psycopg2) al formato que necesita asyncpg
    (`postgresql+asyncpg://`).

    También convierte `?sslmode=require` → `?ssl=require` (psycopg2 usa el
    primero, asyncpg entiende el segundo).

    Esta lógica está duplicada en `core/config.py` (validador Pydantic) —
    la mantenemos también aquí porque este módulo se importa muy temprano
    (antes que `core.config` en algunos paths) y no queremos depender de
    orden de imports para arrancar la BD.
    """
    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    url = url.replace("?sslmode=", "?ssl=").replace("&sslmode=", "&ssl=")
    return url


# Default: local postgres. En Railway, DATABASE_URL viene inyectada como
# referencia al servicio Postgres y se normaliza al formato asyncpg.
DATABASE_URL = _normalize_database_url(
    os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/supplier_db")
)

engine = create_async_engine(DATABASE_URL, echo=True)

SessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

async def get_db():
    async with SessionLocal() as session:
        yield session
