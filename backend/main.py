from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager
from database import engine, Base
from routers import contracts, payments, facturas, consolidado, reportes, oficinas_oracle, archivo_plano

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create tables if they don't exist (useful for dev)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Shutdown

app = FastAPI(title="Supplier Service API", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(contracts.router, prefix="/api", tags=["contratos"])
app.include_router(payments.router, prefix="/api", tags=["pagos"])
app.include_router(facturas.router, prefix="/api", tags=["facturas"])
app.include_router(consolidado.router, prefix="/api", tags=["consolidado"])
app.include_router(reportes.router, prefix="/api", tags=["reportes"])
app.include_router(oficinas_oracle.router, prefix="/api", tags=["oficinas-oracle"])
app.include_router(archivo_plano.router, prefix="/api", tags=["archivo-plano"])

@app.get("/")
def read_root():
    return {"message": "Supplier Service API is running"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
