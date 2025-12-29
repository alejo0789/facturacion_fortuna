from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import schemas, crud
from database import get_db
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
    db: AsyncSession = Depends(get_db)
):
    """
    Search contracts by Provider Name, Office Name, or Contract Number.
    """
    return await crud.get_contratos(db, skip=skip, limit=limit, search=search)

@router.get("/contratos/{contrato_id}", response_model=schemas.Contrato)
async def read_contrato(contrato_id: int, db: AsyncSession = Depends(get_db)):
    db_contrato = await crud.get_contrato(db, contrato_id)
    if db_contrato is None:
        raise HTTPException(status_code=404, detail="Contrato not found")
    return db_contrato

@router.post("/contratos/", response_model=schemas.Contrato)
async def create_contrato(contrato: schemas.ContratoCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create_contrato(db, contrato)

# --- File Upload/Download ---
@router.post("/contratos/{contrato_id}/upload-pdf")
async def upload_contract_pdf(
    contrato_id: int, 
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    """Upload a PDF file for a contract"""
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos PDF")
    
    if file.content_type != 'application/pdf':
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido")
    
    # Get contract with provider info
    contrato = await crud.get_contrato(db, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    if not contrato.proveedor:
        raise HTTPException(status_code=400, detail="El contrato no tiene proveedor asociado")
    
    # Create provider folder
    provider_folder = CONTRACTS_DIR / sanitize_folder_name(contrato.proveedor.nombre)
    provider_folder.mkdir(exist_ok=True)
    
    # Generate filename
    safe_filename = f"contrato_{contrato_id}_{file.filename}"
    safe_filename = re.sub(r'[^\w\.\-]', '_', safe_filename)
    file_path = provider_folder / safe_filename
    
    # Save file
    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)
    
    # Update contract with file path
    relative_path = str(file_path.relative_to(CONTRACTS_DIR))
    await crud.update_contrato_archivo(db, contrato_id, relative_path)
    
    return {"message": "Archivo subido correctamente", "path": relative_path}

@router.get("/contratos/{contrato_id}/pdf")
async def get_contract_pdf(contrato_id: int, db: AsyncSession = Depends(get_db)):
    """Download/view the contract PDF"""
    contrato = await crud.get_contrato(db, contrato_id)
    if not contrato:
        raise HTTPException(status_code=404, detail="Contrato no encontrado")
    
    if not contrato.archivo_contrato:
        raise HTTPException(status_code=404, detail="Este contrato no tiene archivo adjunto")
    
    file_path = CONTRACTS_DIR / contrato.archivo_contrato
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en el servidor")
    
    return FileResponse(
        path=file_path, 
        media_type='application/pdf',
        headers={"Content-Disposition": f"inline; filename={file_path.name}"}
    )

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
async def read_proveedores(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    return await crud.get_proveedores(db, skip=skip, limit=limit)

@router.post("/proveedores/", response_model=schemas.Proveedor)
async def create_proveedor(proveedor: schemas.ProveedorCreate, db: AsyncSession = Depends(get_db)):
    db_prov = await crud.get_proveedor_by_nit(db, nit=proveedor.nit)
    if db_prov:
        raise HTTPException(status_code=400, detail="Provider with this NIT already exists")
    return await crud.create_proveedor(db, proveedor)

@router.get("/oficinas/", response_model=List[schemas.Oficina])
async def read_oficinas(skip: int = 0, limit: int = 100, search: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """
    Search offices by code, name, city, zone, or address.
    """
    return await crud.get_oficinas(db, skip=skip, limit=limit, search=search)

@router.post("/oficinas/", response_model=schemas.Oficina)
async def create_oficina(oficina: schemas.OficinaCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create_oficina(db, oficina)

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
