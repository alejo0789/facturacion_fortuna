from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import schemas, crud
from database import get_db
from core.dependencies import get_current_empresa
from services.signed_urls import create_pdf_token
import os
import re
from pathlib import Path

router = APIRouter()

# Directory to store contract PDFs
CONTRACTS_DIR = Path("contratos_pdf")
CONTRACTS_DIR.mkdir(exist_ok=True)

def sanitize_folder_name(name: str) -> str:
    """Convert provider name to a safe folder name"""
    # Remove special characters and replace spaces with underscores
    name = re.sub(r'[^\w\s-]', '', name)
    name = re.sub(r'\s+', '_', name)
    return name.strip().upper()

# --- Search ---
@router.get("/contratos/", response_model=List[schemas.Contrato])
async def search_contratos(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """
    Search contracts by Provider Name, Office Name, or Contract Number.
    Filtra por empresa activa (tenant) para aislamiento multi-tenant.
    """
    return await crud.get_contratos(db, skip=skip, limit=limit, search=search, empresa_id=empresa.id)

@router.get("/contratos/{contrato_id}", response_model=schemas.Contrato)
async def read_contrato(contrato_id: int, db: AsyncSession = Depends(get_db)):
    db_contrato = await crud.get_contrato(db, contrato_id)
    if db_contrato is None:
        raise HTTPException(status_code=404, detail="Contrato not found")
    return db_contrato

@router.post("/contratos/", response_model=schemas.Contrato)
async def create_contrato(
    contrato: schemas.ContratoCreate,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    return await crud.create_contrato(db, contrato, empresa_id=empresa.id)

# --- File Upload/Download ---
@router.post("/contratos/{contrato_id}/upload-pdf")
async def upload_contract_pdf(
    contrato_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload a PDF file for a contract.

    Valida por magic bytes (%PDF-) además del content-type header. El header
    de MIME es informativo (el atacante puede mandar lo que quiera).
    """
    # Get contract with provider info FIRST — evita gastar disco si el
    # contrato no existe
    contrato = await crud.get_contrato(db, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    if not contrato.proveedor:
        raise HTTPException(status_code=400, detail="El contrato no tiene proveedor asociado")

    # Leer + validar magic bytes ANTES de tocar el disco
    content = await file.read()
    from services.upload_validation import validate_upload
    validate_upload(content, filename=file.filename or "", allowed={"pdf"})

    # Create provider folder
    provider_folder = CONTRACTS_DIR / sanitize_folder_name(contrato.proveedor.nombre)
    provider_folder.mkdir(exist_ok=True)

    # Generate filename — solo alfanum, punto y guión
    safe_filename = f"contrato_{contrato_id}_{file.filename or 'file.pdf'}"
    safe_filename = re.sub(r'[^\w\.\-]', '_', safe_filename)
    file_path = provider_folder / safe_filename

    # Defensa contra path traversal en el nombre generado
    if not str(file_path.resolve()).startswith(str(CONTRACTS_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Path invalido")

    with open(file_path, 'wb') as f:
        f.write(content)

    # Update contract with file path
    relative_path = str(file_path.relative_to(CONTRACTS_DIR))
    await crud.update_contrato_archivo(db, contrato_id, relative_path)

    return {"message": "Archivo subido correctamente", "path": relative_path}

@router.get("/contratos/{contrato_id}/pdf")
async def get_contract_pdf(
    contrato_id: int,
    t: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Download/view the contract PDF.

    Endpoint sirve el PDF inline. La ruta figura como pública en el middleware
    porque el navegador no puede enviar Bearer al abrir en tab nuevo. La
    autorización real se hace aquí verificando el token firmado `?t=` que
    ata la petición a la empresa activa.

    Compatibilidad legacy: si NO viene token, se sirve solo el PDF pero
    validando path traversal. Es aceptable durante migración; para producción
    exigir token siempre (ver flag `settings.REQUIRE_SIGNED_PDF_URLS`).
    """
    contrato = await crud.get_contrato(db, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    if not contrato.archivo_contrato:
        raise HTTPException(status_code=404, detail="Este contrato no tiene archivo adjunto")

    # Verificación de token firmado (si viene). El token contiene (empresa_id,
    # contrato_id, exp) firmado con JWT_SECRET_KEY.
    from services.signed_urls import verify_pdf_token
    if t:
        payload = verify_pdf_token(t, kind="contrato", resource_id=contrato_id)
        if not payload:
            raise HTTPException(status_code=403, detail="Token invalido o expirado")
        if getattr(contrato, "empresa_id", None) != payload["empresa_id"]:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
    else:
        # Backwards compat: sin token, no podemos verificar tenant.
        # Se permite durante migración, pero se loguea para monitoreo.
        import logging
        logging.getLogger(__name__).warning(
            "PDF servido sin token firmado — contrato_id=%s. "
            "Migrar frontend a signed URLs.", contrato_id,
        )

    # Defensa contra path traversal — resuelve el path y valida que no sale
    # del directorio configurado.
    base_dir = CONTRACTS_DIR.resolve()
    try:
        file_path = (CONTRACTS_DIR / contrato.archivo_contrato).resolve()
    except (OSError, ValueError):
        raise HTTPException(status_code=400, detail="Path invalido")
    if not str(file_path).startswith(str(base_dir)):
        raise HTTPException(status_code=400, detail="Path fuera del directorio permitido")

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en el servidor")

    return FileResponse(
        path=file_path,
        media_type='application/pdf',
        headers={"Content-Disposition": f"inline; filename={file_path.name}"}
    )

@router.get("/contratos/{contrato_id}/pdf-url")
async def get_contract_pdf_signed_url(
    contrato_id: int,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Devuelve una URL firmada con TTL corto que sirve para abrir el PDF
    en un nuevo tab del navegador (donde no se puede mandar Authorization).

    La URL retornada tiene forma:
        /api/contratos/42/pdf?t=<HMAC firmado con JWT_SECRET_KEY>

    El token codifica (kind='contrato', resource_id=42, empresa_id=X, exp).
    El endpoint público que lo consume valida los 4 campos.
    """
    contrato = await crud.get_contrato(db, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    if getattr(contrato, "empresa_id", None) not in (None, empresa.id):
        raise HTTPException(status_code=404, detail="Contrato no encontrado")

    token = create_pdf_token(
        kind="contrato",
        resource_id=contrato_id,
        empresa_id=empresa.id,
    )
    return {
        "url": f"/api/contratos/{contrato_id}/pdf?t={token}",
        "expires_in_seconds": 300,
    }


@router.delete("/contratos/{contrato_id}/pdf")
async def delete_contract_pdf(contrato_id: int, db: AsyncSession = Depends(get_db)):
    """Delete the contract PDF file"""
    contrato = await crud.get_contrato(db, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    if not contrato.archivo_contrato:
        raise HTTPException(status_code=404, detail="Este contrato no tiene archivo adjunto")
    
    file_path = CONTRACTS_DIR / contrato.archivo_contrato
    if file_path.exists():
        os.remove(file_path)
    
    await crud.update_contrato_archivo(db, contrato_id, None)
    return {"message": "Archivo eliminado correctamente"}

# --- Helpers for Providers/Offices ---
@router.get("/proveedores/", response_model=List[schemas.Proveedor])
async def read_proveedores(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Lista proveedores filtrados por empresa activa (multi-tenant)."""
    return await crud.get_proveedores(db, skip=skip, limit=limit, search=search, empresa_id=empresa.id)

@router.get("/proveedores/buscar-oracle/{nit}")
async def buscar_proveedor_oracle(nit: str, db: AsyncSession = Depends(get_db)):
    """
    Busca un proveedor por NIT en Oracle MANAGER.VINCULADO.
    Retorna el nombre si existe, o error si no se encuentra.
    También verifica si ya existe en la base de datos local.
    """
    from oracle_database import get_proveedor_by_nit_oracle
    
    # Limpiar el NIT - remover guión y dígito verificador si existe
    nit_clean = nit.split('-')[0].strip() if '-' in nit else nit.strip()
    
    # Verificar si ya existe en la base de datos local
    existing = await crud.get_proveedor_by_nit(db, nit_clean)
    if existing:
        return {
            "found": True,
            "source": "local",
            "nit": existing.nit,
            "nombre": existing.nombre,
            "already_exists": True,
            "message": "Este proveedor ya existe en la base de datos local"
        }
    
    # Buscar en Oracle
    try:
        oracle_result = get_proveedor_by_nit_oracle(nit_clean)
        
        if oracle_result:
            return {
                "found": True,
                "source": "oracle",
                "nit": nit_clean,
                "nombre": oracle_result["nombre"],
                "already_exists": False,
                "message": "Proveedor encontrado en Oracle"
            }
        else:
            return {
                "found": False,
                "source": None,
                "nit": nit_clean,
                "nombre": None,
                "already_exists": False,
                "message": "Proveedor no encontrado en Oracle (MANAGER.VINCULADO)"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando Oracle: {str(e)}")

@router.post("/proveedores/", response_model=schemas.Proveedor)
async def create_proveedor(
    proveedor: schemas.ProveedorCreate,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """
    Crea un proveedor. Si solo viene el NIT, consulta Oracle para obtener el nombre.
    """
    from oracle_database import get_proveedor_by_nit_oracle
    
    # Limpiar el NIT
    nit_clean = proveedor.nit.split('-')[0].strip() if '-' in proveedor.nit else proveedor.nit.strip()
    
    # Verificar si ya existe en este tenant
    db_prov = await crud.get_proveedor_by_nit(db, nit=nit_clean, empresa_id=empresa.id)
    if db_prov:
        raise HTTPException(status_code=400, detail="Ya existe un proveedor con este NIT")
    
    # Si no viene el nombre o viene vacío, buscarlo en Oracle
    nombre = proveedor.nombre
    if not nombre or nombre.strip() == "" or nombre == "PENDING_ORACLE_LOOKUP":
        oracle_result = get_proveedor_by_nit_oracle(nit_clean)
        if oracle_result:
            nombre = oracle_result["nombre"]
        else:
            raise HTTPException(
                status_code=404, 
                detail=f"No se encontró el proveedor con NIT {nit_clean} en Oracle"
            )
    
    # Crear el proveedor con el NIT limpio
    proveedor_data = schemas.ProveedorCreate(nit=nit_clean, nombre=nombre)
    return await crud.create_proveedor(db, proveedor_data, empresa_id=empresa.id)

@router.get("/oficinas/", response_model=List[schemas.Oficina])
async def read_oficinas(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Lista oficinas filtradas por empresa activa (multi-tenant)."""
    return await crud.get_oficinas(db, skip=skip, limit=limit, search=search, empresa_id=empresa.id)

@router.post("/oficinas/", response_model=schemas.Oficina)
async def create_oficina(
    oficina: schemas.OficinaCreate,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    return await crud.create_oficina(db, oficina, empresa_id=empresa.id)

# --- UPDATE Endpoints ---
@router.put("/proveedores/{proveedor_id}", response_model=schemas.Proveedor)
async def update_proveedor(proveedor_id: int, proveedor: schemas.ProveedorCreate, db: AsyncSession = Depends(get_db)):
    result = await crud.update_proveedor(db, proveedor_id, proveedor)
    if not result:
        raise HTTPException(status_code=404, detail="Provider not found")
    return result

@router.put("/oficinas/{oficina_id}", response_model=schemas.Oficina)
async def update_oficina(oficina_id: int, oficina: schemas.OficinaCreate, db: AsyncSession = Depends(get_db)):
    result = await crud.update_oficina(db, oficina_id, oficina)
    if not result:
        raise HTTPException(status_code=404, detail="Office not found")
    return result

@router.put("/contratos/{contrato_id}", response_model=schemas.Contrato)
async def update_contrato(contrato_id: int, contrato: schemas.ContratoCreate, db: AsyncSession = Depends(get_db)):
    result = await crud.update_contrato(db, contrato_id, contrato)
    if not result:
        raise HTTPException(status_code=404, detail="Contract not found")
    return result

# --- DELETE Endpoints ---
@router.delete("/proveedores/{proveedor_id}")
async def delete_proveedor(proveedor_id: int, db: AsyncSession = Depends(get_db)):
    result = await crud.delete_proveedor(db, proveedor_id)
    if not result:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"ok": True}

@router.delete("/oficinas/{oficina_id}")
async def delete_oficina(oficina_id: int, db: AsyncSession = Depends(get_db)):
    result = await crud.delete_oficina(db, oficina_id)
    if not result:
        raise HTTPException(status_code=404, detail="Office not found")
    return {"ok": True}

@router.delete("/contratos/{contrato_id}")
async def delete_contrato(contrato_id: int, db: AsyncSession = Depends(get_db)):
    result = await crud.delete_contrato(db, contrato_id)
    if not result:
        raise HTTPException(status_code=404, detail="Contract not found")
    return {"ok": True}
