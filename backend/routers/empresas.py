"""
Router de gestión de Empresas (tenants) dentro de una Firma.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from core.dependencies import get_current_user, require_role
from models_tenant import Empresa, UsuarioEmpresa
from schemas_empresa import EmpresaCreate, EmpresaUpdate, EmpresaResponse
from services.empresa_seed import seed_empresa_default


router = APIRouter(prefix="/empresas", tags=["empresas"])


@router.post("/", response_model=EmpresaResponse)
async def create_empresa(
    data: EmpresaCreate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.firma_id and not current_user.es_superadmin:
        raise HTTPException(status_code=403, detail="Usuario no pertenece a una firma")

    empresa = Empresa(
        firma_id=current_user.firma_id,
        nombre=data.nombre,
        nombre_comercial=data.nombre_comercial,
        nit=data.nit,
        digito_verificacion=data.digito_verificacion,
        direccion=data.direccion,
        ciudad=data.ciudad,
        departamento=data.departamento,
        telefono=data.telefono,
        email=data.email,
        representante_legal=data.representante_legal,
        regimen_tributario=data.regimen_tributario,
        sidebar_title=data.nombre,
    )
    db.add(empresa)
    await db.flush()

    db.add(UsuarioEmpresa(
        usuario_id=current_user.id,
        empresa_id=empresa.id,
        rol="ADMIN",
    ))

    # Seed inicial de contabilidad (PUC + configuraciones de impuesto).
    # No falla la creación de empresa si el seed tiene un problema; se loguea.
    try:
        await seed_empresa_default(empresa.id, db)
    except Exception:
        import logging
        logging.getLogger(__name__).exception(
            "seed_empresa_default fallo para empresa_id=%s", empresa.id
        )

    await db.commit()
    await db.refresh(empresa)
    return EmpresaResponse.model_validate(empresa)


@router.get("/", response_model=list[EmpresaResponse])
async def list_empresas(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.es_superadmin:
        rows = (await db.execute(select(Empresa).where(Empresa.activa == True))).scalars().all()
        return [EmpresaResponse.model_validate(e) for e in rows]

    rows = (await db.execute(
        select(Empresa)
        .join(UsuarioEmpresa, UsuarioEmpresa.empresa_id == Empresa.id)
        .where(UsuarioEmpresa.usuario_id == current_user.id)
        .where(Empresa.activa == True)
    )).scalars().all()
    return [EmpresaResponse.model_validate(e) for e in rows]


@router.get("/{empresa_id}", response_model=EmpresaResponse)
async def get_empresa(
    empresa_id: int,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    empresa = (await db.execute(select(Empresa).where(Empresa.id == empresa_id))).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return EmpresaResponse.model_validate(empresa)


@router.put("/{empresa_id}", response_model=EmpresaResponse)
async def update_empresa(
    empresa_id: int,
    data: EmpresaUpdate,
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    empresa = (await db.execute(select(Empresa).where(Empresa.id == empresa_id))).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(empresa, k, v)

    await db.commit()
    await db.refresh(empresa)
    return EmpresaResponse.model_validate(empresa)


@router.post("/{empresa_id}/seed-contabilidad")
async def seed_contabilidad(
    empresa_id: int,
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """
    Siembra (o completa) el PUC y las configuraciones de impuesto default
    para una empresa existente. Idempotente: omite lo que ya existe.

    Útil para empresas creadas antes de que el seed automático estuviera activo.
    """
    empresa = (await db.execute(select(Empresa).where(Empresa.id == empresa_id))).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    try:
        resumen = await seed_empresa_default(empresa_id, db)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al sembrar contabilidad: {e}")

    return {
        "empresa_id": empresa_id,
        "resumen": resumen,
    }


@router.post("/{empresa_id}/rotate-api-key", response_model=EmpresaResponse)
async def rotate_api_key(
    empresa_id: int,
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    empresa = (await db.execute(select(Empresa).where(Empresa.id == empresa_id))).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    empresa.api_key = str(uuid.uuid4())
    await db.commit()
    await db.refresh(empresa)
    return EmpresaResponse.model_validate(empresa)
