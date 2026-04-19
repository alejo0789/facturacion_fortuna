"""
Punto de entrada FastAPI.

Esta versión agrega la capa SaaS multi-tenant sobre la aplicación existente:
- Nuevos routers: auth, empresas, usuarios
- Middleware dual: JWT Bearer + X-API-Key (acepta tanto la API_KEY global
  legada como las api_keys por Empresa)
- En el arranque se siembra la Firma y Empresa por defecto (La Fortuna) y
  el superadmin del .env. Además se ejecuta el backfill de `empresa_id`
  sobre las tablas existentes que aún no lo tienen asignado.
"""
import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text

from database import engine, Base, SessionLocal
from core.config import settings
from core.security import hash_password

# Routers — los modelos se importan implícitamente al importar los routers,
# pero además registramos explícitamente models y models_tenant para que
# Base.metadata incluya TODAS las tablas antes del create_all.
import models  # noqa: F401  (registra modelos existentes en Base.metadata)
import models_tenant  # noqa: F401  (registra Firma/Empresa/Usuario/UsuarioEmpresa)
import models_contabilidad  # noqa: F401  (registra PUC/Periodos/Asientos/Banca)
import models_impuestos  # noqa: F401  (registra ConfigImpuesto/Tarifa/Retencion)

from routers import (
    contracts, payments, pagos, facturas, consolidado,
    reportes, oficinas_oracle, archivo_plano, feedback, asistente,
    auth, empresas, usuarios,
    contabilidad, impuestos, bancario, dian,
)
from middleware.auth_dual import AuthDualMiddleware
from populate_puc import clonar_puc

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


async def _seed_defaults():
    """Siembra Firma/Empresa por defecto, superadmin, y backfillea empresa_id."""
    from models_tenant import Firma, Empresa, Usuario

    async with SessionLocal() as db:
        # --- Firma por defecto ---
        firma = (await db.execute(
            select(Firma).where(Firma.nit == settings.DEFAULT_FIRMA_NIT)
        )).scalar_one_or_none()
        if not firma:
            firma = Firma(
                nombre=settings.DEFAULT_FIRMA_NOMBRE,
                nit=settings.DEFAULT_FIRMA_NIT,
            )
            db.add(firma)
            await db.flush()
            logger.info("Seed: Firma por defecto creada (%s)", firma.nombre)

        # --- Empresa por defecto ---
        empresa = (await db.execute(
            select(Empresa).where(Empresa.nit == settings.DEFAULT_EMPRESA_NIT)
        )).scalar_one_or_none()
        if not empresa:
            empresa = Empresa(
                firma_id=firma.id,
                nombre=settings.DEFAULT_EMPRESA_NOMBRE,
                nit=settings.DEFAULT_EMPRESA_NIT,
                sidebar_title=settings.DEFAULT_EMPRESA_NOMBRE,
            )
            db.add(empresa)
            await db.flush()
            logger.info("Seed: Empresa por defecto creada (id=%s)", empresa.id)

        # --- Superadmin ---
        admin = (await db.execute(
            select(Usuario).where(Usuario.email == settings.SUPERADMIN_EMAIL)
        )).scalar_one_or_none()
        if not admin:
            admin = Usuario(
                email=settings.SUPERADMIN_EMAIL,
                nombre="Super Admin",
                password_hash=hash_password(settings.SUPERADMIN_PASSWORD),
                es_superadmin=True,
                activo=True,
                firma_id=firma.id,
            )
            db.add(admin)
            logger.info("Seed: superadmin creado (%s)", settings.SUPERADMIN_EMAIL)

        await db.commit()

        # --- Backfill empresa_id en tablas existentes ---
        backfill_tables = [
            "proveedores", "oficinas", "contratos", "pagos",
            "facturas", "factura_oficinas", "factura_uploads",
            "proveedor_feedback", "contrato_auditoria",
        ]
        for tbl in backfill_tables:
            try:
                await db.execute(text(
                    f"UPDATE {tbl} SET empresa_id = :eid WHERE empresa_id IS NULL"
                ), {"eid": empresa.id})
            except Exception as e:
                logger.warning("Backfill omitido para %s: %s", tbl, e)
        await db.commit()
        logger.info("Backfill de empresa_id completado para %d tablas", len(backfill_tables))

        # --- Seed PUC para la empresa por defecto ---
        from models_contabilidad import CuentaPUC
        count_puc = (await db.execute(
            select(CuentaPUC).where(CuentaPUC.empresa_id == empresa.id).limit(1)
        )).scalar_one_or_none()
        if not count_puc:
            insertadas = await clonar_puc(empresa.id, db)
            await db.commit()
            logger.info("Seed: PUC cargado (%d cuentas) para empresa %s", insertadas, empresa.id)

        # --- Seed configuración de impuestos por defecto ---
        from decimal import Decimal as _Dec
        from models_impuestos import ConfiguracionImpuesto, TarifaImpuesto
        default_impuestos = [
            ("IVA", "240810", _Dec("19.00"), "IVA descontable 19%"),
            ("RETEFUENTE", "236540", _Dec("4.00"), "Retefuente compras 4%"),
            ("RETEIVA", "236701", _Dec("15.00"), "ReteIVA 15%"),
            ("RETEICA", "236805", _Dec("0.414"), "ReteICA 4.14x1000"),
        ]
        for tipo, cuenta, tarifa, desc in default_impuestos:
            existente = (await db.execute(
                select(ConfiguracionImpuesto).where(
                    ConfiguracionImpuesto.empresa_id == empresa.id,
                    ConfiguracionImpuesto.tipo == tipo,
                )
            )).scalar_one_or_none()
            if existente:
                continue
            config = ConfiguracionImpuesto(
                empresa_id=empresa.id,
                tipo=tipo,
                cuenta_puc=cuenta,
                descripcion=desc,
                activo=True,
            )
            db.add(config)
            await db.flush()
            db.add(TarifaImpuesto(
                configuracion_id=config.id,
                concepto="default",
                tarifa_pct=tarifa,
                base_minima=_Dec("0"),
                es_default=True,
            ))
        await db.commit()
        logger.info("Seed: configuración de impuestos por defecto lista")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_defaults()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

# CORS (se ejecuta primero)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Empresa-Id", "X-API-Key"],
    expose_headers=["Content-Disposition"],
)

# ---- Routers de identidad ----
app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(empresas.router, prefix="/api", tags=["empresas"])
app.include_router(usuarios.router, prefix="/api", tags=["usuarios"])

# ---- Routers de negocio (preservados de la versión original) ----
app.include_router(contracts.router, prefix="/api", tags=["contratos"])
app.include_router(payments.router, prefix="/api", tags=["pagos"])
app.include_router(pagos.router, prefix="/api", tags=["pagos-modulo"])
app.include_router(facturas.router, prefix="/api", tags=["facturas"])
app.include_router(consolidado.router, prefix="/api", tags=["consolidado"])
app.include_router(reportes.router, prefix="/api", tags=["reportes"])
app.include_router(oficinas_oracle.router, prefix="/api", tags=["oficinas-oracle"])
app.include_router(archivo_plano.router, prefix="/api", tags=["archivo-plano"])
app.include_router(feedback.router, prefix="/api", tags=["feedback"])
app.include_router(asistente.router, prefix="/api", tags=["asistente"])

# ---- Módulo contable (Iteración 2 + Fase 3/4) ----
app.include_router(contabilidad.router, prefix="/api", tags=["contabilidad"])
app.include_router(impuestos.router, prefix="/api", tags=["impuestos"])
app.include_router(bancario.router, prefix="/api", tags=["bancario"])
app.include_router(dian.router, prefix="/api", tags=["dian"])


@app.get("/")
def read_root():
    return {"message": f"{settings.APP_NAME} v{settings.APP_VERSION}"}


# Envolvemos la app con el middleware ASGI dual (JWT + API Key).
# Uvicorn debe apuntar a `main:application`.
application = AuthDualMiddleware(app)


if __name__ == "__main__":
    uvicorn.run("main:application", host="0.0.0.0", port=8000, reload=True)
