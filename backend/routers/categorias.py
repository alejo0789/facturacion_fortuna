"""
Categorias Router - Category management for role-based invoice filtering

Provides:
1. CRUD for categories (super admin only)
2. Role assignment to categories (super admin only)
3. Query roles from parent system
4. Get categories accessible to current user's role
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
import os
import httpx

from database import get_db
import models
import schemas

router = APIRouter()

# Configuration
SUPER_ADMIN_EMAILS = [email.strip() for email in os.getenv("SUPER_ADMIN_EMAILS", "ingenieroia@acertemos.com").split(",") if email.strip()]
SUPER_ADMIN_USER_IDS = [int(id.strip()) for id in os.getenv("SUPER_ADMIN_USER_IDS", "725").split(",") if id.strip()]
PARENT_SYSTEM_ROLES_URL = os.getenv("PARENT_SYSTEM_ROLES_URL", "")
PARENT_SYSTEM_API_TOKEN = os.getenv("PARENT_SYSTEM_API_TOKEN", "")

def is_super_admin(identifier: Optional[str] = None, user_id: Optional[int] = None, rol_id: Optional[int] = None) -> bool:
    """Check if user is a super admin based on email, user_id, or rol_id"""
    # Role ID 1 is always Super Admin
    if rol_id == 1:
        return True
        
    if identifier and identifier in SUPER_ADMIN_EMAILS:
        return True
        
    if user_id and user_id in SUPER_ADMIN_USER_IDS:
        return True
        
    return False


async def get_user_categoria_ids(db: AsyncSession, rol_id: Optional[int] = None, email: Optional[str] = None) -> List[int]:
    """Get category IDs accessible to a role or email"""
    cat_ids = set()
    
    if rol_id:
        result = await db.execute(
            select(models.CategoriaRol.categoria_id)
            .where(models.CategoriaRol.rol_id == rol_id)
        )
        for r in result.fetchall():
            cat_ids.add(r[0])
            
    if email:
        result = await db.execute(
            select(models.CategoriaUsuario.categoria_id)
            .where(func.lower(models.CategoriaUsuario.email) == func.lower(email.strip()))
        )
        for r in result.fetchall():
            cat_ids.add(r[0])
            
    return list(cat_ids)


# ============================================
# Core Categories (CRUD)
# ============================================

@router.get("/", response_model=List[schemas.Categoria])
async def list_categorias(
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[int] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """
    List all categories.
    - Super admin sees all categories
    - Regular users see only categories assigned to their role or email
    """
    query = select(models.Categoria).options(
        selectinload(models.Categoria.roles),
        selectinload(models.Categoria.usuarios)
    ).where(models.Categoria.activa == True)
    
    # If not super admin, filter by role/email
    if not is_super_admin(x_user_email, x_user_id):
        categoria_ids = await get_user_categoria_ids(db, rol_id=x_user_rol_id, email=x_user_email)
        if categoria_ids:
            query = query.where(models.Categoria.id.in_(categoria_ids))
        else:
            return []  # No categories assigned to this user
    
    query = query.order_by(models.Categoria.nombre)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/mis-categorias", response_model=List[schemas.CategoriaSimple])
async def get_mis_categorias(
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[int] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get categories accessible to the current user's role or email.
    Returns simplified category info for dropdowns.
    """
    query = select(models.Categoria).where(models.Categoria.activa == True)
    
    # Super admin sees all
    if is_super_admin(x_user_email, x_user_id):
        pass  # No filter
    else:
        categoria_ids = await get_user_categoria_ids(db, rol_id=x_user_rol_id, email=x_user_email)
        if categoria_ids:
            query = query.where(models.Categoria.id.in_(categoria_ids))
        else:
            return []
    
    query = query.order_by(models.Categoria.nombre)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=schemas.Categoria)
async def create_categoria(
    categoria: schemas.CategoriaCreate,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: AsyncSession = Depends(get_db)
):
    """Create a new category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede crear categorías")
    
    # Check if name already exists
    existing = await db.execute(
        select(models.Categoria).where(models.Categoria.nombre == categoria.nombre)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Ya existe una categoría con nombre '{categoria.nombre}'")
    
    db_categoria = models.Categoria(
        **categoria.model_dump(),
        created_by=x_user_name or f"user_{x_user_id}"
    )
    db.add(db_categoria)
    await db.commit()
    await db.refresh(db_categoria)
    
    # Reload with relationships
    result = await db.execute(
        select(models.Categoria)
        .options(selectinload(models.Categoria.roles), selectinload(models.Categoria.usuarios))
        .where(models.Categoria.id == db_categoria.id)
    )
    return result.scalar_one()


@router.get("/{categoria_id}", response_model=schemas.Categoria)
async def get_categoria(
    categoria_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get a single category by ID"""
    result = await db.execute(
        select(models.Categoria)
        .options(selectinload(models.Categoria.roles), selectinload(models.Categoria.usuarios))
        .where(models.Categoria.id == categoria_id)
    )
    categoria = result.scalar_one_or_none()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    return categoria


@router.put("/{categoria_id}", response_model=schemas.Categoria)
async def update_categoria(
    categoria_id: int,
    categoria: schemas.CategoriaUpdate,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Update a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede editar categorías")
    
    result = await db.execute(
        select(models.Categoria).where(models.Categoria.id == categoria_id)
    )
    db_categoria = result.scalar_one_or_none()
    if not db_categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Check for duplicate name
    if categoria.nombre and categoria.nombre != db_categoria.nombre:
        existing = await db.execute(
            select(models.Categoria).where(models.Categoria.nombre == categoria.nombre)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Ya existe una categoría con nombre '{categoria.nombre}'")
    
    update_data = categoria.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_categoria, key, value)
    
    await db.commit()
    await db.refresh(db_categoria)
    
    # Reload with relationships
    result = await db.execute(
        select(models.Categoria)
        .options(selectinload(models.Categoria.roles), selectinload(models.Categoria.usuarios))
        .where(models.Categoria.id == categoria_id)
    )
    return result.scalar_one()


@router.delete("/{categoria_id}")
async def delete_categoria(
    categoria_id: int,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Delete a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede eliminar categorías")
    
    result = await db.execute(
        select(models.Categoria).where(models.Categoria.id == categoria_id)
    )
    db_categoria = result.scalar_one_or_none()
    if not db_categoria:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Check if category has facturas or contratos
    facturas_count = await db.execute(
        select(models.Factura).where(models.Factura.categoria_id == categoria_id)
    )
    if facturas_count.scalar_one_or_none():
        raise HTTPException(
            status_code=400, 
            detail="No se puede eliminar la categoría porque tiene facturas asignadas"
        )
    
    await db.delete(db_categoria)
    await db.commit()
    return {"message": "Categoría eliminada exitosamente"}


# ============================================
# Role Assignment (Super Admin Only)
# ============================================

@router.get("/{categoria_id}/roles", response_model=List[schemas.CategoriaRol])
async def get_categoria_roles(
    categoria_id: int,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Get all roles assigned to a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede ver roles de categorías")
    
    result = await db.execute(
        select(models.CategoriaRol).where(models.CategoriaRol.categoria_id == categoria_id)
    )
    return result.scalars().all()


@router.post("/{categoria_id}/roles", response_model=schemas.CategoriaRol)
async def assign_rol_to_categoria(
    categoria_id: int,
    rol: schemas.CategoriaRolCreate,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Assign a role to a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede asignar roles")
    
    # Verify category exists
    result = await db.execute(
        select(models.Categoria).where(models.Categoria.id == categoria_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Check if assignment already exists
    existing = await db.execute(
        select(models.CategoriaRol)
        .where(models.CategoriaRol.categoria_id == categoria_id)
        .where(models.CategoriaRol.rol_id == rol.rol_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este rol ya está asignado a la categoría")
    
    db_rol = models.CategoriaRol(
        categoria_id=categoria_id,
        rol_id=rol.rol_id,
        rol_nombre=rol.rol_nombre
    )
    db.add(db_rol)
    await db.commit()
    await db.refresh(db_rol)
    return db_rol


@router.delete("/{categoria_id}/roles/{rol_id}")
async def remove_rol_from_categoria(
    categoria_id: int,
    rol_id: int,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Remove a role from a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede quitar roles")
    
    result = await db.execute(
        select(models.CategoriaRol)
        .where(models.CategoriaRol.categoria_id == categoria_id)
        .where(models.CategoriaRol.rol_id == rol_id)
    )
    db_rol = result.scalar_one_or_none()
    if not db_rol:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    
    await db.delete(db_rol)
    await db.commit()
    return {"message": "Rol removido de la categoría"}


# ============================================
# Parent System Integration
# ============================================

@router.get("/roles-disponibles")
async def get_roles_disponibles(
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
):
    """
    Fetch available roles from parent system (Super Admin only).
    Configure PARENT_SYSTEM_ROLES_URL in .env
    """
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede consultar roles")
    
    if not PARENT_SYSTEM_ROLES_URL:
        raise HTTPException(
            status_code=500, 
            detail="PARENT_SYSTEM_ROLES_URL no está configurado en .env"
        )
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {}
            if PARENT_SYSTEM_API_TOKEN:
                headers["Authorization"] = f"Bearer {PARENT_SYSTEM_API_TOKEN}"
            
            response = await client.get(PARENT_SYSTEM_ROLES_URL, headers=headers)
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error al consultar roles del sistema padre: {str(e)}"
        )


@router.get("/check-super-admin")
async def check_super_admin(
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
):
    """Check if current user is super admin"""
    return {
        "is_super_admin": is_super_admin(x_user_email, x_user_id),
        "user_email": x_user_email,
        "user_id": x_user_id,
        "super_admin_emails": SUPER_ADMIN_EMAILS
    }

# ============================================
# User (Email) Assignment (Super Admin Only)
# ============================================

@router.get("/{categoria_id}/usuarios", response_model=List[schemas.CategoriaUsuario])
async def get_categoria_usuarios(
    categoria_id: int,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Get all users (emails) assigned to a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede ver usuarios de categorías")
    
    result = await db.execute(
        select(models.CategoriaUsuario).where(models.CategoriaUsuario.categoria_id == categoria_id)
    )
    return result.scalars().all()


@router.post("/{categoria_id}/usuarios", response_model=schemas.CategoriaUsuario)
async def assign_usuario_to_categoria(
    categoria_id: int,
    usuario: schemas.CategoriaUsuarioCreate,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Assign a user email to a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede asignar usuarios")
    
    usuario.email = usuario.email.lower().strip()
    
    # Verify category exists
    result = await db.execute(
        select(models.Categoria).where(models.Categoria.id == categoria_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    
    # Check if assignment already exists
    existing = await db.execute(
        select(models.CategoriaUsuario)
        .where(models.CategoriaUsuario.categoria_id == categoria_id)
        .where(models.CategoriaUsuario.email == usuario.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este usuario ya está asignado a la categoría")
    
    db_usr = models.CategoriaUsuario(
        categoria_id=categoria_id,
        email=usuario.email
    )
    db.add(db_usr)
    await db.commit()
    await db.refresh(db_usr)
    return db_usr


@router.delete("/{categoria_id}/usuarios/{email}")
async def remove_usuario_from_categoria(
    categoria_id: int,
    email: str,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Remove a user email from a category (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede quitar usuarios")
    
    email = email.lower().strip()
    
    result = await db.execute(
        select(models.CategoriaUsuario)
        .where(models.CategoriaUsuario.categoria_id == categoria_id)
        .where(models.CategoriaUsuario.email == email)
    )
    db_usr = result.scalar_one_or_none()
    if not db_usr:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    
    await db.delete(db_usr)
    await db.commit()
    return {"message": "Usuario removido de la categoría"}

# ============================================
# Module Access Management (Super Admin Only)
# ============================================

@router.get("/modulos/{modulo}/roles", response_model=List[schemas.ModuloAccesoRol])
async def get_modulo_roles(
    modulo: str,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Get all roles assigned to a module (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede ver accesos de módulos")
    
    result = await db.execute(
        select(models.ModuloAccesoRol).where(models.ModuloAccesoRol.modulo == modulo.upper())
    )
    return result.scalars().all()


@router.post("/modulos/{modulo}/roles", response_model=schemas.ModuloAccesoRol)
async def assign_rol_to_modulo(
    modulo: str,
    rol: schemas.ModuloAccesoRolCreate,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Assign a role to a module (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede asignar roles a módulos")
    
    modulo_upper = modulo.upper()
    
    # Check if assignment already exists
    existing = await db.execute(
        select(models.ModuloAccesoRol)
        .where(models.ModuloAccesoRol.modulo == modulo_upper)
        .where(models.ModuloAccesoRol.rol_id == rol.rol_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este rol ya está asignado al módulo")
    
    db_rol = models.ModuloAccesoRol(
        modulo=modulo_upper,
        rol_id=rol.rol_id,
        rol_nombre=rol.rol_nombre
    )
    db.add(db_rol)
    await db.commit()
    await db.refresh(db_rol)
    return db_rol


@router.delete("/modulos/{modulo}/roles/{rol_id}")
async def remove_rol_from_modulo(
    modulo: str,
    rol_id: int,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Remove a role from a module (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede quitar roles de módulos")
    
    modulo_upper = modulo.upper()
    
    result = await db.execute(
        select(models.ModuloAccesoRol)
        .where(models.ModuloAccesoRol.modulo == modulo_upper)
        .where(models.ModuloAccesoRol.rol_id == rol_id)
    )
    db_rol = result.scalar_one_or_none()
    if not db_rol:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    
    await db.delete(db_rol)
    await db.commit()
    return {"message": "Rol removido del módulo"}


@router.get("/modulos/{modulo}/usuarios", response_model=List[schemas.ModuloAccesoUsuario])
async def get_modulo_usuarios(
    modulo: str,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Get all users (emails) assigned to a module (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede ver accesos de módulos")
    
    result = await db.execute(
        select(models.ModuloAccesoUsuario).where(models.ModuloAccesoUsuario.modulo == modulo.upper())
    )
    return result.scalars().all()


@router.post("/modulos/{modulo}/usuarios", response_model=schemas.ModuloAccesoUsuario)
async def assign_usuario_to_modulo(
    modulo: str,
    usuario: schemas.ModuloAccesoUsuarioCreate,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Assign a user email to a module (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede asignar usuarios a módulos")
    
    modulo_upper = modulo.upper()
    email_clean = usuario.email.lower().strip()
    
    # Check if assignment already exists
    existing = await db.execute(
        select(models.ModuloAccesoUsuario)
        .where(models.ModuloAccesoUsuario.modulo == modulo_upper)
        .where(models.ModuloAccesoUsuario.email == email_clean)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este usuario ya está asignado al módulo")
    
    db_usr = models.ModuloAccesoUsuario(
        modulo=modulo_upper,
        email=email_clean
    )
    db.add(db_usr)
    await db.commit()
    await db.refresh(db_usr)
    return db_usr


@router.delete("/modulos/{modulo}/usuarios/{email}")
async def remove_usuario_from_modulo(
    modulo: str,
    email: str,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Remove a user email from a module (Super Admin only)"""
    if not is_super_admin(x_user_email, x_user_id):
        raise HTTPException(status_code=403, detail="Solo super admin puede quitar usuarios de módulos")
    
    modulo_upper = modulo.upper()
    email_clean = email.lower().strip()
    
    result = await db.execute(
        select(models.ModuloAccesoUsuario)
        .where(models.ModuloAccesoUsuario.modulo == modulo_upper)
        .where(models.ModuloAccesoUsuario.email == email_clean)
    )
    db_usr = result.scalar_one_or_none()
    if not db_usr:
        raise HTTPException(status_code=404, detail="Asignación no encontrada")
    
    await db.delete(db_usr)
    await db.commit()
    return {"message": "Usuario removido del módulo"}


@router.get("/modulos/{modulo}/check-acceso")
async def check_modulo_acceso(
    modulo: str,
    x_user_email: Optional[str] = Header(None, alias="X-User-Email"),
    x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
    x_user_rol_id: Optional[int] = Header(None, alias="X-User-Rol-Id"),
    db: AsyncSession = Depends(get_db)
):
    """Check if current user has access to a specific module"""
    if is_super_admin(x_user_email, x_user_id):
        return {"has_access": True, "is_super_admin": True}
        
    modulo_upper = modulo.upper()
    
    # Check roles
    if x_user_rol_id:
        result = await db.execute(
            select(models.ModuloAccesoRol)
            .where(models.ModuloAccesoRol.modulo == modulo_upper)
            .where(models.ModuloAccesoRol.rol_id == x_user_rol_id)
        )
        if result.scalar_one_or_none():
            return {"has_access": True, "reason": "role"}
            
    # Check emails
    if x_user_email:
        email_clean = x_user_email.lower().strip()
        result = await db.execute(
            select(models.ModuloAccesoUsuario)
            .where(models.ModuloAccesoUsuario.modulo == modulo_upper)
            .where(models.ModuloAccesoUsuario.email == email_clean)
        )
        if result.scalar_one_or_none():
            return {"has_access": True, "reason": "email"}
            
    return {"has_access": False}

