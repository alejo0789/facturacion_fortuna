"""
Router de autenticación: registro de firma + usuario admin, login, refresh,
información del usuario actual y listado de empresas accesibles.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from core.config import settings
from core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from core.dependencies import get_current_user
from models_tenant import Firma, Empresa, Usuario, UsuarioEmpresa
from services.empresa_seed import seed_empresa_default
from services.rate_limit_db import check_rate_limit, clear_bucket
from services.token_blacklist import revoke_token
from services.audit import log_action
from schemas_auth import (
    LoginRequest, RegisterRequest, TokenResponse, RefreshRequest,
    UserInfo, EmpresaInfo,
)


router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    """Devuelve la IP del cliente.

    SEGURIDAD: `X-Forwarded-For` solo se acepta si la petición viene de un
    proxy listado en `TRUSTED_PROXIES`. De lo contrario un atacante puede
    poner cualquier IP en el header y saltar el rate limiter.
    """
    real_ip = request.client.host if request.client else "unknown"

    trusted = settings.trusted_proxies_list
    if trusted and real_ip in trusted:
        fwd = request.headers.get("X-Forwarded-For")
        if fwd:
            # Primera IP en la cadena = cliente original
            return fwd.split(",")[0].strip()

    return real_ip


def _check_password(password: str):
    """Valida complejidad mínima de contraseña.

    Reglas:
      - largo >= MIN_PASSWORD_LENGTH (default 8)
      - al menos 1 dígito
      - al menos 1 letra
      - máximo 200 chars (evita DoS con passwords enormes al bcrypt)
    """
    if len(password) < settings.MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"La contraseña debe tener al menos {settings.MIN_PASSWORD_LENGTH} caracteres",
        )
    if len(password) > 200:
        raise HTTPException(
            status_code=400,
            detail="La contraseña es demasiado larga (máximo 200 caracteres)",
        )
    if not any(c.isdigit() for c in password):
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe incluir al menos un dígito",
        )
    if not any(c.isalpha() for c in password):
        raise HTTPException(
            status_code=400,
            detail="La contraseña debe incluir al menos una letra",
        )


@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    bucket = f"register:ip:{ip}"

    await check_rate_limit(
        db, bucket=bucket,
        max_attempts=3, window_seconds=30 * 60,
        error_msg="Demasiados intentos de registro",
    )

    _check_password(data.password)

    if (await db.execute(select(Usuario).where(Usuario.email == data.email))).scalar_one_or_none():
        await log_action(db, request, action="auth.register", result="failure",
                         details={"reason": "email_exists", "email": data.email})
        raise HTTPException(status_code=400, detail="El email ya esta registrado")

    if (await db.execute(select(Firma).where(Firma.nit == data.firma_nit))).scalar_one_or_none():
        await log_action(db, request, action="auth.register", result="failure",
                         details={"reason": "firma_nit_exists", "nit": data.firma_nit})
        raise HTTPException(status_code=400, detail="Ya existe una firma con ese NIT")

    firma = Firma(nombre=data.firma_nombre, nit=data.firma_nit)
    db.add(firma)
    await db.flush()

    user = Usuario(
        firma_id=firma.id,
        email=data.email,
        nombre=data.nombre,
        password_hash=hash_password(data.password),
        es_superadmin=False,
        activo=True,
    )
    db.add(user)
    await db.flush()

    empresas_info: list[EmpresaInfo] = []
    if data.empresa_nombre and data.empresa_nit:
        empresa = Empresa(
            firma_id=firma.id,
            nombre=data.empresa_nombre,
            nit=data.empresa_nit,
            sidebar_title=data.empresa_nombre,
        )
        db.add(empresa)
        await db.flush()

        db.add(UsuarioEmpresa(usuario_id=user.id, empresa_id=empresa.id, rol="ADMIN"))
        await db.flush()

        # Seed inicial de contabilidad (PUC + configuraciones de impuesto).
        # No falla el registro si el seed tiene un problema; se loguea y sigue.
        try:
            await seed_empresa_default(empresa.id, db)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "seed_empresa_default fallo para empresa_id=%s", empresa.id
            )

        empresas_info.append(EmpresaInfo(
            id=empresa.id, nombre=empresa.nombre, nombre_comercial=empresa.nombre_comercial,
            nit=empresa.nit, rol="ADMIN", logo_url=empresa.logo_url,
        ))

    await log_action(db, request, action="auth.register", user_id=user.id,
                     empresa_id=empresas_info[0].id if empresas_info else None,
                     result="success")
    await db.commit()

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        user=UserInfo.model_validate(user),
        empresas=empresas_info,
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    bucket_ip = f"login:ip:{ip}"
    bucket_email = f"login:email:{data.email.lower().strip()}"

    # Doble check: por IP (5/15min) y por email (10/15min). Un atacante que
    # rota IPs sigue frenado por el bucket de email.
    await check_rate_limit(
        db, bucket=bucket_ip,
        max_attempts=5, window_seconds=15 * 60,
        error_msg="Demasiados intentos desde esta IP",
    )
    await check_rate_limit(
        db, bucket=bucket_email,
        max_attempts=10, window_seconds=15 * 60,
        error_msg="Demasiados intentos para este correo",
    )

    user = (await db.execute(select(Usuario).where(Usuario.email == data.email))).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        await log_action(db, request, action="auth.login_failed",
                         user_id=user.id if user else None, result="failure",
                         details={"email": data.email})
        await db.commit()
        raise HTTPException(status_code=401, detail="Credenciales invalidas")
    if not user.activo:
        await log_action(db, request, action="auth.login_failed",
                         user_id=user.id, result="failure",
                         details={"reason": "inactive"})
        await db.commit()
        raise HTTPException(status_code=403, detail="Usuario desactivado")

    # Login OK — limpia buckets de attempts fallidos
    await clear_bucket(db, bucket_ip)
    await clear_bucket(db, bucket_email)

    rows = (await db.execute(
        select(UsuarioEmpresa, Empresa)
        .join(Empresa, UsuarioEmpresa.empresa_id == Empresa.id)
        .where(UsuarioEmpresa.usuario_id == user.id)
        .where(Empresa.activa == True)
    )).all()
    empresas_info = [
        EmpresaInfo(
            id=e.id, nombre=e.nombre, nombre_comercial=e.nombre_comercial,
            nit=e.nit, rol=ue.rol, logo_url=e.logo_url,
        )
        for ue, e in rows
    ]

    if user.es_superadmin:
        all_empresas = (await db.execute(select(Empresa).where(Empresa.activa == True))).scalars().all()
        empresas_info = [
            EmpresaInfo(
                id=e.id, nombre=e.nombre, nombre_comercial=e.nombre_comercial,
                nit=e.nit, rol="ADMIN", logo_url=e.logo_url,
            )
            for e in all_empresas
        ]

    await log_action(db, request, action="auth.login", user_id=user.id,
                     result="success",
                     details={"empresas": len(empresas_info)})
    await db.commit()

    return TokenResponse(
        access_token=create_access_token({"sub": str(user.id)}),
        refresh_token=create_refresh_token({"sub": str(user.id)}),
        user=UserInfo.model_validate(user),
        empresas=empresas_info,
    )


@router.post("/logout")
async def logout(
    request: Request,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoca el JWT del usuario actual (por `jti`).

    Idempotente: si el token ya está revocado, no falla. Post-logout el
    frontend debe borrar el token de localStorage.
    """
    jti = current_user.__dict__.get("_current_jti")
    exp = current_user.__dict__.get("_current_token_exp")
    if jti and exp:
        # `exp` en JWT es epoch seconds; lo convertimos a datetime tz-aware
        from datetime import datetime as _dt, timezone as _tz
        expires_at = _dt.fromtimestamp(int(exp), tz=_tz.utc)
        await revoke_token(db, jti, expires_at, reason="logout")

    await log_action(db, request, action="auth.logout",
                     user_id=current_user.id, result="success")
    await db.commit()
    return {"status": "logged_out"}


@router.post("/refresh")
async def refresh(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Refresh token invalido")

    user = (await db.execute(
        select(Usuario).where(Usuario.id == int(payload["sub"]))
    )).scalar_one_or_none()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")

    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserInfo)
async def me(current_user=Depends(get_current_user)):
    return UserInfo.model_validate(current_user)


@router.get("/empresas", response_model=list[EmpresaInfo])
async def my_empresas(
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.es_superadmin:
        all_empresas = (await db.execute(select(Empresa).where(Empresa.activa == True))).scalars().all()
        return [
            EmpresaInfo(
                id=e.id, nombre=e.nombre, nombre_comercial=e.nombre_comercial,
                nit=e.nit, rol="ADMIN", logo_url=e.logo_url,
            )
            for e in all_empresas
        ]

    rows = (await db.execute(
        select(UsuarioEmpresa, Empresa)
        .join(Empresa, UsuarioEmpresa.empresa_id == Empresa.id)
        .where(UsuarioEmpresa.usuario_id == current_user.id)
        .where(Empresa.activa == True)
    )).all()
    return [
        EmpresaInfo(
            id=e.id, nombre=e.nombre, nombre_comercial=e.nombre_comercial,
            nit=e.nit, rol=ue.rol, logo_url=e.logo_url,
        )
        for ue, e in rows
    ]
