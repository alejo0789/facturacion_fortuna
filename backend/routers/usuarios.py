"""
Router de gestión de usuarios: crear usuario dentro de la firma,
listar, asignar roles por empresa.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from core.security import hash_password
from core.dependencies import get_current_user, require_role
from models_tenant import Usuario, UsuarioEmpresa, Empresa
from schemas_auth import UserCreate, UserUpdate, AssignRoleRequest, UserInfo
from services.audit import log_action


router = APIRouter(prefix="/usuarios", tags=["usuarios"])

VALID_ROLES = {
    "ADMIN", "CONTADOR", "AUDITOR",
    "FACTURACION", "CONTABILIDAD", "PRODUCTOS", "VENTAS",
    "SOLO_LECTURA",
}


@router.post("/", response_model=UserInfo)
async def create_user(
    data: UserCreate,
    request: Request,
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if (await db.execute(select(Usuario).where(Usuario.email == data.email))).scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ya registrado")

    if not current_user.firma_id and not current_user.es_superadmin:
        raise HTTPException(status_code=403, detail="Usuario no tiene firma asociada")

    user = Usuario(
        firma_id=current_user.firma_id,
        email=data.email,
        nombre=data.nombre,
        password_hash=hash_password(data.password),
        activo=True,
    )
    db.add(user)
    await db.flush()

    await log_action(db, request, action="usuario.create",
                     user_id=current_user.id,
                     resource_type="usuario", resource_id=user.id,
                     details={"email": data.email})
    await db.commit()
    await db.refresh(user)
    return UserInfo.model_validate(user)


@router.get("/", response_model=list[UserInfo])
async def list_users(
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if current_user.es_superadmin:
        rows = (await db.execute(select(Usuario))).scalars().all()
    else:
        rows = (await db.execute(
            select(Usuario).where(Usuario.firma_id == current_user.firma_id)
        )).scalars().all()
    return [UserInfo.model_validate(u) for u in rows]


@router.put("/{user_id}", response_model=UserInfo)
async def update_user(
    user_id: int,
    data: UserUpdate,
    request: Request,
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(Usuario).where(Usuario.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if not current_user.es_superadmin and user.firma_id != current_user.firma_id:
        raise HTTPException(status_code=403, detail="No puede modificar usuarios de otra firma")

    changes = data.model_dump(exclude_unset=True)
    was_active = user.activo
    for k, v in changes.items():
        setattr(user, k, v)

    action = "usuario.update"
    if "activo" in changes and was_active and not user.activo:
        action = "usuario.deactivate"
    await log_action(db, request, action=action,
                     user_id=current_user.id,
                     resource_type="usuario", resource_id=user.id,
                     details={"changes": list(changes.keys())})

    await db.commit()
    await db.refresh(user)
    return UserInfo.model_validate(user)


@router.post("/asignar-rol")
async def assign_role(
    data: AssignRoleRequest,
    request: Request,
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    if data.rol not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail=f"Rol inválido. Permitidos: {', '.join(sorted(VALID_ROLES))}",
        )

    empresa = (await db.execute(select(Empresa).where(Empresa.id == data.empresa_id))).scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    existing = (await db.execute(
        select(UsuarioEmpresa).where(
            UsuarioEmpresa.usuario_id == data.usuario_id,
            UsuarioEmpresa.empresa_id == data.empresa_id,
        )
    )).scalar_one_or_none()

    prev_rol = existing.rol if existing else None
    if existing:
        existing.rol = data.rol
    else:
        db.add(UsuarioEmpresa(
            usuario_id=data.usuario_id,
            empresa_id=data.empresa_id,
            rol=data.rol,
        ))

    await log_action(db, request, action="usuario.role_change",
                     user_id=current_user.id, empresa_id=data.empresa_id,
                     resource_type="usuario", resource_id=data.usuario_id,
                     details={"prev_rol": prev_rol, "new_rol": data.rol})
    await db.commit()
    return {"status": "ok", "usuario_id": data.usuario_id, "empresa_id": data.empresa_id, "rol": data.rol}
