"""
Router de gestión de Empresas (tenants) dentro de una Firma.
"""
import time
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import httpx

from database import get_db
from core.dependencies import get_current_user, require_role, get_current_empresa
from models_tenant import Empresa, UsuarioEmpresa
from schemas_empresa import (
    EmpresaCreate, EmpresaUpdate, EmpresaResponse,
    IntegracionesResponse, IntegracionesUpdate, IntegracionesTestResult,
)
from services.empresa_seed import seed_empresa_default
from services.integraciones_n8n import (
    get_shared_process_url,
    get_shared_search_url,
)


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


# ── Integraciones n8n + IA + correo (panel de tenant) ────────────────────
# El usuario configura aquí los webhooks de su instancia n8n y los IDs de
# las credenciales (OpenAI, Outlook/Gmail). El backend los lee de la empresa
# activa del JWT para inyectarlos al payload de cada webhook. Es la pieza
# central del multi-tenant n8n sin intervención del developer.

def _enrich_integraciones_response(empresa) -> IntegracionesResponse:
    """Adjunta a la respuesta el modo (saas_managed vs self_hosted) + URLs efectivas."""
    base = IntegracionesResponse.model_validate(empresa)
    shared_p = get_shared_process_url()
    shared_s = get_shared_search_url()
    base.shared_process_url = shared_p
    base.shared_search_url = shared_s
    base.effective_process_url = empresa.n8n_webhook_url or shared_p
    base.effective_search_url = empresa.n8n_search_webhook or shared_s
    # Self-hosted sólo si el override apunta a una URL distinta a la shared
    base.mode = (
        "self_hosted"
        if empresa.n8n_webhook_url and empresa.n8n_webhook_url != shared_p
        else "saas_managed"
    )
    return base


@router.get("/me/integraciones", response_model=IntegracionesResponse)
async def get_integraciones(
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN")),
):
    """Devuelve la config actual + modo (saas_managed | self_hosted)."""
    return _enrich_integraciones_response(empresa)


@router.put("/me/integraciones", response_model=IntegracionesResponse)
async def update_integraciones(
    data: IntegracionesUpdate,
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Actualiza la config de integraciones (parcial)."""
    payload = data.model_dump(exclude_unset=True)
    for field, value in payload.items():
        setattr(empresa, field, value)
    await db.commit()
    await db.refresh(empresa)
    return _enrich_integraciones_response(empresa)


@router.post("/me/integraciones/test", response_model=IntegracionesTestResult)
async def test_webhook(
    empresa=Depends(get_current_empresa),
    current_user=Depends(require_role("ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Dispara un ping al webhook de upload para verificar conexión.

    Envía un payload con `event=ping` y `apiKey` de la empresa. El workflow
    de n8n debe responder 2xx (idealmente con `{"ok": true}`). Guarda el
    resultado en `n8n_webhook_last_test` + `n8n_webhook_last_status`.
    """
    # URL efectiva: override del tenant o la shared del SaaS
    effective_url = empresa.n8n_webhook_url or get_shared_process_url()
    if not effective_url:
        raise HTTPException(
            status_code=400,
            detail=(
                "No hay webhook configurado. El SaaS no tiene una URL compartida "
                "(N8N_PROCESS_WEBHOOK_URL en .env) y la empresa no tiene override. "
                "Configura una de las dos antes de probar."
            ),
        )

    start = time.monotonic()
    ok = False
    status_code: int | None = None
    message = ""

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                effective_url,
                json={
                    "event": "ping",
                    "apiKey": empresa.api_key,
                    "empresaId": empresa.id,
                    "timestamp": datetime.now().isoformat(),
                },
                headers={
                    "X-API-Key": empresa.api_key or "",
                    "Content-Type": "application/json",
                },
            )
            status_code = resp.status_code
            ok = 200 <= resp.status_code < 400
            message = (
                "Conexión exitosa con el workflow n8n."
                if ok else
                f"n8n respondió HTTP {resp.status_code}: {resp.text[:200]}"
            )
    except httpx.TimeoutException:
        message = "Timeout: el workflow tardó más de 10s en responder al ping."
    except httpx.RequestError as e:
        message = f"No se pudo conectar al webhook: {e}"

    # Persistir resultado para mostrarlo en UI
    empresa.n8n_webhook_last_test = datetime.now()
    empresa.n8n_webhook_last_status = "ok" if ok else "error"
    await db.commit()

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return IntegracionesTestResult(
        ok=ok,
        status_code=status_code,
        message=message,
        elapsed_ms=elapsed_ms,
    )
