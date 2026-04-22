from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Header
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
import schemas, crud, models
from database import get_db
import os
import re
from pathlib import Path
from routers.categorias import is_super_admin, get_user_categoria_ids

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
    categoria_id: Optional[int] = None,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[int] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Search contracts by Provider Name, Office Name, or Contract Number.
    Optionally filter by categoria_id.
    """
    # Check if user is super admin
    from routers.categorias import is_super_admin, get_user_categoria_ids
    
    # If not super admin, get allowed categories for this role
    allowed_categoria_ids = None
    if not is_super_admin(x_user_email, x_user_id):
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id=x_user_rol_id, email=x_user_email)
        # If categoria_id is specified, verify user has access
        if categoria_id and categoria_id not in allowed_categoria_ids:
            return []
            
    return await crud.get_contratos(
        db, skip=skip, limit=limit, search=search, 
        categoria_id=categoria_id,
        allowed_categoria_ids=allowed_categoria_ids
    )

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
@router.get("/proveedores/", response_model=List[schemas.ProveedorConCategorias])
async def read_proveedores(
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = None,
    categoria_id: Optional[int] = None,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[str] = Header(None, alias="X-User-Rol-Id"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    db: AsyncSession = Depends(get_db)
):
    """List providers. Optionally filter by authorized category/area."""
    allowed_categoria_ids = None
    if not is_super_admin(x_user_email, int(x_user_id) if x_user_id else None):
        rol_id_int = int(x_user_rol_id) if x_user_rol_id else None
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id_int, x_user_email)
        
    return await crud.get_proveedores(
        db, skip=skip, limit=limit, search=search, 
        categoria_id=categoria_id, allowed_categoria_ids=allowed_categoria_ids
    )

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
            "nombre_comercial": existing.nombre_comercial,
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
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_rol_id: Optional[str] = Header(None, alias="X-User-Rol-Id"),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Crea un proveedor o recupera uno existente. 
    Si solo viene el NIT, consulta Oracle para obtener el nombre.
    Si el usuario tiene una categoría asignada, autoriza automáticamente al proveedor para esa categoría.
    """
    from oracle_database import get_proveedor_by_nit_oracle
    from routers.categorias import is_super_admin, get_user_categoria_ids
    from sqlalchemy import select as sa_select
    
    # Limpiar el NIT
    nit_clean = proveedor.nit.split('-')[0].strip() if '-' in proveedor.nit else proveedor.nit.strip()
    
    # Verificar si ya existe
    db_prov = await crud.get_proveedor_by_nit(db, nit=nit_clean)
    
    if not db_prov:
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
        db_prov = await crud.create_proveedor(db, proveedor_data)
    
    # --- Auto-Autorización por Categoría ---
    # Si no es Super Admin, obtener sus categorías y autorizar la primera (o todas)
    user_id_int = int(x_user_id) if x_user_id else None
    rol_id_int = int(x_user_rol_id) if x_user_rol_id else None
    if not is_super_admin(x_user_email, user_id_int, rol_id_int):
        allowed_ids = await get_user_categoria_ids(db, rol_id_int, x_user_email)
        
        for cat_id in allowed_ids:
            # Verificar si ya está autorizado
            existing = await db.execute(
                sa_select(models.ProveedorCategoria)
                .where(models.ProveedorCategoria.proveedor_id == db_prov.id)
                .where(models.ProveedorCategoria.categoria_id == cat_id)
            )
            if not existing.scalar_one_or_none():
                db_pc = models.ProveedorCategoria(
                    proveedor_id=db_prov.id,
                    categoria_id=cat_id,
                    autorizado_por=x_user_email or 'desconocido'
                )
                db.add(db_pc)
        
        await db.commit()
    
    return db_prov


@router.post("/proveedores/{proveedor_id}/autorizar-categoria", response_model=schemas.ProveedorConCategorias)
async def autorizar_proveedor_categoria(
    proveedor_id: int,
    body: schemas.ProveedorCategoriaCreate,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[str] = Header(None, alias="X-User-Rol-Id"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    db: AsyncSession = Depends(get_db)
):
    """
    Authorize a provider for a specific category/area.
    Records the authorizing user's email.
    """
    from sqlalchemy import select as sa_select
    from sqlalchemy.orm import selectinload as sil

    # Check if user has permission for this category
    user_id_int = int(x_user_id) if x_user_id else None
    rol_id_int = int(x_user_rol_id) if x_user_rol_id else None
    if not is_super_admin(x_user_email, user_id_int, rol_id_int):
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id_int, x_user_email)
        if body.categoria_id not in allowed_categoria_ids:
            raise HTTPException(status_code=403, detail="No tienes permisos para autorizar en esta área")

    # Verify provider exists
    proveedor = await crud.get_proveedor(db, proveedor_id)
    if not proveedor:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Check duplicate
    existing = await db.execute(
        sa_select(models.ProveedorCategoria)
        .where(models.ProveedorCategoria.proveedor_id == proveedor_id)
        .where(models.ProveedorCategoria.categoria_id == body.categoria_id)
    )
    if not existing.scalar_one_or_none():
        db_pc = models.ProveedorCategoria(
            proveedor_id=proveedor_id,
            categoria_id=body.categoria_id,
            autorizado_por=body.autorizado_por or x_user_email or 'desconocido'
        )
        db.add(db_pc)
        await db.commit()

    # Return full proveedor with updated categories
    result = await db.execute(
        sa_select(models.Proveedor)
        .options(
            sil(models.Proveedor.categorias_autorizadas)
            .selectinload(models.ProveedorCategoria.categoria)
        )
        .where(models.Proveedor.id == proveedor_id)
    )
    p = result.scalar_one()
    for pc in p.categorias_autorizadas:
        pc.categoria_nombre = pc.categoria.nombre if pc.categoria else ''
        pc.categoria_color = pc.categoria.color if pc.categoria else '#6366f1'
    return p


@router.delete("/proveedores/{proveedor_id}/desautorizar-categoria/{categoria_id}")
async def desautorizar_proveedor_categoria(
    proveedor_id: int,
    categoria_id: int,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[str] = Header(None, alias="X-User-Rol-Id"),
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    db: AsyncSession = Depends(get_db)
):
    """Remove authorization of a provider for a specific category/area."""
    from sqlalchemy import select as sa_select

    # Check if user has permission for this category
    if not is_super_admin(x_user_email, int(x_user_id) if x_user_id else None):
        rol_id_int = int(x_user_rol_id) if x_user_rol_id else None
        allowed_categoria_ids = await get_user_categoria_ids(db, rol_id_int, x_user_email)
        if categoria_id not in allowed_categoria_ids:
            raise HTTPException(status_code=403, detail="No tienes permisos para quitar autorización en esta área")

    result = await db.execute(
        sa_select(models.ProveedorCategoria)
        .where(models.ProveedorCategoria.proveedor_id == proveedor_id)
        .where(models.ProveedorCategoria.categoria_id == categoria_id)
    )
    db_pc = result.scalar_one_or_none()
    if not db_pc:
        raise HTTPException(status_code=404, detail="Autorización no encontrada")

    await db.delete(db_pc)
    await db.commit()
    return {"message": "Autorización eliminada correctamente"}


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
