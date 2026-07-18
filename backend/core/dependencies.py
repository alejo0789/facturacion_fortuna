"""
FastAPI dependencies: autenticación, resolución de tenant y chequeo de rol.

Diseño dual:
- JWT Bearer (usuarios del frontend).
- X-API-Key: acepta la clave global legada (settings.API_KEY, usada por n8n
  de La Fortuna) y la clave por empresa (Empresa.api_key).
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from core.config import settings
from core.security import decode_token


class _LegacyAPIKeyUser:
    """Usuario virtual cuando la petición viene con la API_KEY global legada.

    Se comporta como ADMIN sobre la empresa por defecto (Fortuna). Mantiene
    el flujo de n8n funcionando sin cambios hasta que se emita una api_key
    por empresa.
    """
    id = 0
    email = "legacy-apikey@local"
    nombre = "Legacy API Key"
    es_superadmin = False
    activo = True
    firma_id = None

    def __init__(self, empresa_id: int | None):
        self._empresa_id = empresa_id
        self._rol = "ADMIN"


class _EmpresaAPIKeyUser:
    """Usuario virtual para peticiones con la api_key de una Empresa concreta."""
    id = 0
    nombre = "Empresa API Key"
    es_superadmin = False
    activo = True
    firma_id = None

    def __init__(self, empresa):
        self._empresa_id = empresa.id
        self._rol = "ADMIN"
        self.email = f"api@{empresa.nit}"


async def _resolve_default_empresa_id(db: AsyncSession) -> int | None:
    """Resuelve la empresa por defecto (para la API_KEY legada)."""
    from models_tenant import Empresa
    result = await db.execute(
        select(Empresa).where(Empresa.nit == settings.DEFAULT_EMPRESA_NIT).limit(1)
    )
    empresa = result.scalar_one_or_none()
    return empresa.id if empresa else None


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Valida JWT o API Key y devuelve un Usuario (o un usuario virtual)."""
    from models_tenant import Usuario, Empresa

    # 1) JWT Bearer
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token invalido o expirado")

        # Verificar que no esté revocado (logout, cambio de password, etc.)
        jti = payload.get("jti")
        if jti:
            from services.token_blacklist import is_revoked
            if await is_revoked(db, jti):
                raise HTTPException(status_code=401, detail="Token revocado")

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalido")

        result = await db.execute(select(Usuario).where(Usuario.id == int(user_id)))
        user = result.scalar_one_or_none()
        if not user or not user.activo:
            raise HTTPException(status_code=401, detail="Usuario no encontrado o inactivo")
        # Guardo el jti + exp en el user para poder revocarlo al logout
        user.__dict__["_current_jti"] = jti
        user.__dict__["_current_token_exp"] = payload.get("exp")
        return user

    # 2) X-API-Key
    api_key = request.headers.get("X-API-Key", "")
    if api_key:
        # 2a) API key global legada (n8n Fortuna)
        if settings.API_KEY and api_key == settings.API_KEY:
            empresa_id = await _resolve_default_empresa_id(db)
            return _LegacyAPIKeyUser(empresa_id)

        # 2b) API key por Empresa
        result = await db.execute(select(Empresa).where(Empresa.api_key == api_key))
        empresa = result.scalar_one_or_none()
        if empresa and empresa.activa:
            return _EmpresaAPIKeyUser(empresa)

        raise HTTPException(status_code=403, detail="API Key invalida")

    raise HTTPException(status_code=401, detail="Autenticacion requerida")


async def get_current_empresa(
    request: Request,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Resuelve la empresa activa desde header X-Empresa-Id o desde la api_key."""
    from models_tenant import Empresa, UsuarioEmpresa

    # Usuarios por API key ya traen empresa resuelta
    if hasattr(current_user, "_empresa_id") and current_user._empresa_id:
        result = await db.execute(select(Empresa).where(Empresa.id == current_user._empresa_id))
        empresa = result.scalar_one_or_none()
        if empresa and empresa.activa:
            return empresa
        raise HTTPException(status_code=404, detail="Empresa por defecto no configurada")

    empresa_id_header = request.headers.get("X-Empresa-Id")
    if not empresa_id_header:
        raise HTTPException(status_code=400, detail="Header X-Empresa-Id requerido")

    try:
        empresa_id = int(empresa_id_header)
    except ValueError:
        raise HTTPException(status_code=400, detail="X-Empresa-Id debe ser entero")

    if current_user.es_superadmin:
        result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
        empresa = result.scalar_one_or_none()
        if not empresa:
            raise HTTPException(status_code=404, detail="Empresa no encontrada")
        return empresa

    result = await db.execute(
        select(UsuarioEmpresa).where(
            UsuarioEmpresa.usuario_id == current_user.id,
            UsuarioEmpresa.empresa_id == empresa_id,
        )
    )
    acceso = result.scalar_one_or_none()
    if not acceso:
        raise HTTPException(status_code=403, detail="No tiene acceso a esta empresa")

    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if not empresa or not empresa.activa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada o inactiva")
    return empresa


def require_role(*roles: str):
    """Factory: devuelve una dependencia que exige rol en la empresa activa."""
    async def role_checker(
        request: Request,
        current_user=Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ):
        from models_tenant import UsuarioEmpresa

        if current_user.es_superadmin:
            return current_user

        if hasattr(current_user, "_rol"):
            if current_user._rol in roles:
                return current_user
            raise HTTPException(status_code=403, detail="Rol insuficiente")

        empresa_id_header = request.headers.get("X-Empresa-Id")
        if not empresa_id_header:
            raise HTTPException(status_code=400, detail="Header X-Empresa-Id requerido")

        result = await db.execute(
            select(UsuarioEmpresa).where(
                UsuarioEmpresa.usuario_id == current_user.id,
                UsuarioEmpresa.empresa_id == int(empresa_id_header),
            )
        )
        acceso = result.scalar_one_or_none()
        if not acceso or acceso.rol not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"Se requiere uno de los roles: {', '.join(roles)}",
            )
        return current_user

    return role_checker
