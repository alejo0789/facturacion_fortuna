"""
Endpoints REST para Conciliación DIAN — descarga automatizada del histórico
oficial de facturación electrónica del portal catalogo-vpfe.dian.gov.co.

NO confundir con `dian.py` (Medios Magnéticos / información exógena, formatos
1001, 1007, 1008 anuales). Son obligaciones tributarias distintas:

  - Medios Magnéticos = reporte anual XSD/XML de terceros y saldos.
  - Conciliación DIAN = cruce mes a mes de facturas electrónicas emitidas y
    recibidas contra lo procesado en la app. Base para cuadrar IVA y detectar
    facturas fantasma / no registradas.

Flujo típico (multi-tenant):
  1. GET  /conciliacion-dian/config          → estado (tiene cédula? sesión? última sync?)
  2. PUT  /conciliacion-dian/config          → guarda cédula (Fernet) + periodicidad
  3. POST /conciliacion-dian/sync/start      → crea job, arranca Playwright en background
  4. POST /conciliacion-dian/sync/{id}/magic-link → el usuario pega el link del correo
  5. GET  /conciliacion-dian/sync/{id}       → polling del estado del job
  6. GET  /conciliacion-dian/sync/jobs       → historial de syncs
  7. GET  /conciliacion-dian/documentos      → lista de docs oficiales guardados
  8. GET  /conciliacion-dian/iva-periodos    → resumen IVA por periodicidad
"""
from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.dependencies import get_current_empresa
from database import SessionLocal, get_db
from models_dian import DianSyncJob, DocumentoDian
from schemas_dian import (
    DianConfigIn, DianConfigOut,
    SyncJobStart, SyncJobOut, MagicLinkIn,
    DocumentoDianOut, DocumentosDianPage, ResumenPeriodoIva,
    ConciliacionItem, ConciliacionResumen, ConciliacionResponse,
    AnalisisIVAResponse, KPIsIVAOut, TendenciaPeriodoOut,
    ProveedorTopIVAOut, FacturaHuerfanaOut, RecomendacionOut,
)
from services.credentials_encryption import encrypt_str
from services import dian_sync
from services.dian_conciliacion import (
    conciliar_facturas_vs_dian, resumen_conciliacion,
)
from services.dian_analisis_iva import analizar_iva_estrategico


router = APIRouter()


# ============================================================================
# Config: cédula + periodicidad
# ============================================================================

def _empresa_a_config_out(empresa) -> DianConfigOut:
    """Serializa la Empresa a `DianConfigOut` sin exponer secretos."""
    metodo = (empresa.dian_metodo_auth or "persona").strip()
    tiene_sesion = bool(empresa.dian_sesion_estado_enc)
    # Requiere password en el próximo sync si método usa password Y no hay sesión.
    requiere_pw = (metodo in ("administrador", "usuario_autorizado")) and not tiene_sesion
    return DianConfigOut(
        metodo=metodo,
        tipo_id=empresa.dian_tipo_id or "CC",
        periodicidad=empresa.dian_periodicidad or "bimestral",
        ultima_sync=empresa.dian_ultima_sync,
        tiene_cedula=bool(empresa.dian_cedula_representante_enc),
        tiene_email=bool(empresa.dian_email_enc),
        tiene_nit_empresa_dian=bool(empresa.dian_nit_empresa_dian_enc),
        tiene_doc_usuario=bool(empresa.dian_doc_usuario_enc),
        tiene_sesion=tiene_sesion,
        requiere_password_en_sync=requiere_pw,
    )


@router.get("/conciliacion-dian/config", response_model=DianConfigOut)
async def get_dian_config(empresa=Depends(get_current_empresa)):
    return _empresa_a_config_out(empresa)


@router.put("/conciliacion-dian/config", response_model=DianConfigOut)
async def put_dian_config(
    payload: DianConfigIn,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Guarda la config del método de auth DIAN.

    Los campos son condicionales según `metodo`:
      - persona: cedula_representante (obligatoria si aún no está guardada) + tipo_id
      - administrador: email
      - rep_legal: cedula_representante + tipo_id + nit_empresa_dian
      - usuario_autorizado: doc_usuario + tipo_id + nit_empresa_dian

    Las contraseñas NO van aquí — se envían en /sync/start.
    """
    metodo = payload.metodo
    empresa.dian_metodo_auth = metodo
    empresa.dian_periodicidad = payload.periodicidad
    if payload.tipo_id:
        empresa.dian_tipo_id = payload.tipo_id

    def _norm_digits(s: Optional[str]) -> Optional[str]:
        if s is None:
            return None
        d = "".join(c for c in s if c.isdigit())
        return d or None

    def _need(campo: str, valor):
        if not valor:
            raise HTTPException(
                status_code=400,
                detail=f"El campo '{campo}' es requerido para el método '{metodo}'.",
            )

    if metodo == "persona":
        cedula = _norm_digits(payload.cedula_representante)
        # Solo requerir cédula si aún no está guardada
        if not cedula and not empresa.dian_cedula_representante_enc:
            _need("cedula_representante", None)
        if cedula:
            empresa.dian_cedula_representante_enc = encrypt_str(cedula)

    elif metodo == "administrador":
        email = (payload.email or "").strip()
        if not email and not empresa.dian_email_enc:
            _need("email", None)
        if email:
            empresa.dian_email_enc = encrypt_str(email)

    elif metodo == "rep_legal":
        cedula = _norm_digits(payload.cedula_representante)
        nit_emp = _norm_digits(payload.nit_empresa_dian)
        if not cedula and not empresa.dian_cedula_representante_enc:
            _need("cedula_representante", None)
        if not nit_emp and not empresa.dian_nit_empresa_dian_enc:
            _need("nit_empresa_dian", None)
        if cedula:
            empresa.dian_cedula_representante_enc = encrypt_str(cedula)
        if nit_emp:
            empresa.dian_nit_empresa_dian_enc = encrypt_str(nit_emp)

    elif metodo == "usuario_autorizado":
        doc = _norm_digits(payload.doc_usuario)
        nit_emp = _norm_digits(payload.nit_empresa_dian)
        if not doc and not empresa.dian_doc_usuario_enc:
            _need("doc_usuario", None)
        if not nit_emp and not empresa.dian_nit_empresa_dian_enc:
            _need("nit_empresa_dian", None)
        if doc:
            empresa.dian_doc_usuario_enc = encrypt_str(doc)
        if nit_emp:
            empresa.dian_nit_empresa_dian_enc = encrypt_str(nit_emp)

    # Cambio de método → invalidar sesión guardada (era de otro método).
    # No borramos las otras credenciales por si el usuario quiere volver a
    # ese método más tarde.
    empresa.dian_sesion_estado_enc = None

    await db.commit()
    return _empresa_a_config_out(empresa)


@router.delete("/conciliacion-dian/config/session")
async def delete_dian_session(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Borra la sesión Playwright guardada (fuerza pedir magic link la próxima vez)."""
    empresa.dian_sesion_estado_enc = None
    await db.commit()
    return {"status": "cleared"}


# ============================================================================
# Sync jobs
# ============================================================================

@router.post("/conciliacion-dian/sync/start", response_model=SyncJobOut)
async def start_sync(
    payload: SyncJobStart,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Crea un job y arranca el sync Playwright en background.

    Validación por método:
      persona / rep_legal   → no requieren password; usan magic link al correo.
      administrador         → requiere `payload.password`.
      usuario_autorizado    → requiere `payload.password`.

    Si hay sesión Playwright guardada y `force_password_relogin=False`, el
    sync intenta reusar la sesión (sin password). Si la sesión expiró, y el
    método necesita password, el job falla con instrucción de reintentar
    con contraseña.
    """
    if payload.fecha_desde > payload.fecha_hasta:
        raise HTTPException(status_code=400, detail="fecha_desde debe ser <= fecha_hasta")

    metodo = (empresa.dian_metodo_auth or "persona").strip()

    # Validación de credenciales configuradas por método
    if metodo == "persona":
        if not empresa.dian_cedula_representante_enc:
            raise HTTPException(status_code=400,
                                detail="Configura la cédula del representante en Configuración.")
    elif metodo == "administrador":
        if not empresa.dian_email_enc:
            raise HTTPException(status_code=400,
                                detail="Configura el correo del Administrador en Configuración.")
    elif metodo == "rep_legal":
        if not empresa.dian_cedula_representante_enc or not empresa.dian_nit_empresa_dian_enc:
            raise HTTPException(status_code=400,
                                detail="Configura cédula del rep. legal y NIT empresa en Configuración.")
    elif metodo == "usuario_autorizado":
        if not empresa.dian_nit_empresa_dian_enc or not empresa.dian_doc_usuario_enc:
            raise HTTPException(status_code=400,
                                detail="Configura NIT empresa y documento del usuario autorizado.")

    # Validación de password según método + sesión
    exige_password = metodo in ("administrador", "usuario_autorizado")
    tiene_sesion_guardada = bool(empresa.dian_sesion_estado_enc)
    forzar_relogin = payload.force_password_relogin

    necesita_password_esta_vez = exige_password and (
        forzar_relogin or not tiene_sesion_guardada
    )

    if necesita_password_esta_vez and not payload.password:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El método '{metodo}' requiere contraseña. "
                f"{'La sesión guardada expiró o se forzó re-login. ' if tiene_sesion_guardada else ''}"
                f"Envíala en el campo `password` del body."
            ),
        )

    # Si el usuario forzó relogin, borrar sesión guardada.
    if forzar_relogin:
        empresa.dian_sesion_estado_enc = None

    # Cortar sesiones colgadas viejas (más de 1 hora en pending)
    corte = datetime.utcnow() - timedelta(hours=1)
    result = await db.execute(
        select(DianSyncJob).where(
            DianSyncJob.empresa_id == empresa.id,
            DianSyncJob.estado.in_(("pending_magic_link", "in_progress")),
            DianSyncJob.creado_en < corte,
        )
    )
    for j in result.scalars().all():
        j.estado = "failed"
        j.mensaje = "Timeout esperando resolución (más de 1 hora sin avanzar)."

    # Estado inicial del job depende del método (persona/rep_legal esperan magic link)
    estado_inicial = "pending_magic_link" if metodo in ("persona", "rep_legal") else "in_progress"
    job = DianSyncJob(
        empresa_id=empresa.id,
        fecha_desde=payload.fecha_desde,
        fecha_hasta=payload.fecha_hasta,
        estado=estado_inicial,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Arrancar el worker — la password (si existe) viaja como argumento del thread.
    # Nunca se guarda en BD. Al terminar el thread, la variable local sale del scope.
    dian_sync.spawn_sync_job(job.id, SessionLocal, password=payload.password)

    return job


@router.post("/conciliacion-dian/sync/{job_id}/magic-link")
async def submit_magic_link(
    job_id: int,
    payload: MagicLinkIn,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """El usuario pega el magic link del correo DIAN aquí."""
    result = await db.execute(
        select(DianSyncJob).where(
            DianSyncJob.id == job_id,
            DianSyncJob.empresa_id == empresa.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    if job.estado != "pending_magic_link":
        raise HTTPException(
            status_code=409,
            detail=f"El job está en estado '{job.estado}' — ya no espera el magic link.",
        )

    ok = dian_sync.submit_magic_link_for_job(job_id, payload.link)
    if not ok:
        raise HTTPException(
            status_code=409,
            detail="No hay proceso Playwright esperando este link (el sync pudo haber muerto). Reinicia el sync.",
        )
    return {"status": "received"}


@router.get("/conciliacion-dian/sync/jobs", response_model=list[SyncJobOut])
async def list_sync_jobs(
    limit: int = Query(10, ge=1, le=50),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DianSyncJob)
        .where(DianSyncJob.empresa_id == empresa.id)
        .order_by(DianSyncJob.creado_en.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/conciliacion-dian/sync/{job_id}/cancel")
async def cancel_sync(
    job_id: int,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Cancela un job que está esperando magic link o en progreso.

    Manda un sentinel a la queue del worker → el sync termina limpio,
    cierra el browser y marca el job como failed con mensaje "Cancelado".
    """
    result = await db.execute(
        select(DianSyncJob).where(
            DianSyncJob.id == job_id,
            DianSyncJob.empresa_id == empresa.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")

    if job.estado in ("completed", "failed"):
        return {"status": "already_terminated", "estado": job.estado}

    ok = dian_sync.cancel_pending_job(job_id)
    # Sea que la queue exista o no, marcamos el job como cancelado.
    job.estado = "failed"
    job.mensaje = "Cancelado por el usuario."
    await db.commit()

    return {"status": "cancelled", "signaled_queue": ok}


@router.delete("/conciliacion-dian/sync/jobs/failed")
async def delete_failed_jobs(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Borra todos los jobs de esta empresa que están en estado 'failed'.

    Útil para limpiar el historial mientras se depuran problemas.
    """
    from sqlalchemy import delete as sql_delete
    result = await db.execute(
        sql_delete(DianSyncJob).where(
            DianSyncJob.empresa_id == empresa.id,
            DianSyncJob.estado == "failed",
        )
    )
    await db.commit()
    return {"deleted": result.rowcount or 0}


@router.get("/conciliacion-dian/sync/{job_id}", response_model=SyncJobOut)
async def get_sync_status(
    job_id: int,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DianSyncJob).where(
            DianSyncJob.id == job_id,
            DianSyncJob.empresa_id == empresa.id,
        )
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return job


# ============================================================================
# Documentos DIAN (histórico oficial guardado)
# ============================================================================

@router.get("/conciliacion-dian/documentos", response_model=DocumentosDianPage)
async def list_documentos(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    grupo: Optional[str] = Query(None, description="'Emitidos', 'Recibidos', o vacío"),
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(DocumentoDian).where(DocumentoDian.empresa_id == empresa.id)
    count_stmt = select(func.count(DocumentoDian.id)).where(
        DocumentoDian.empresa_id == empresa.id
    )

    if grupo:
        stmt = stmt.where(DocumentoDian.grupo == grupo)
        count_stmt = count_stmt.where(DocumentoDian.grupo == grupo)
    if fecha_desde:
        stmt = stmt.where(DocumentoDian.fecha_emision >= fecha_desde)
        count_stmt = count_stmt.where(DocumentoDian.fecha_emision >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(DocumentoDian.fecha_emision <= fecha_hasta)
        count_stmt = count_stmt.where(DocumentoDian.fecha_emision <= fecha_hasta)

    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (stmt.order_by(DocumentoDian.fecha_emision.desc().nullslast(),
                          DocumentoDian.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size))

    result = await db.execute(stmt)
    items = list(result.scalars().all())

    out = [
        DocumentoDianOut(
            id=d.id, cufe=d.cufe, prefijo=d.prefijo, folio=d.folio,
            tipo_documento=d.tipo_documento, grupo=d.grupo,
            fecha_emision=d.fecha_emision,
            nit_emisor=d.nit_emisor, nombre_emisor=d.nombre_emisor,
            nit_receptor=d.nit_receptor, nombre_receptor=d.nombre_receptor,
            valor=float(d.valor or 0), iva=float(d.iva or 0),
            valor_bruto=float(d.valor_bruto or 0),
            estado=d.estado,
        )
        for d in items
    ]
    return DocumentosDianPage(items=out, total=total, page=page, page_size=page_size)


# ============================================================================
# IVA por período (bimestral / cuatrimestral / anual)
# ============================================================================

@router.get("/conciliacion-dian/iva-periodos", response_model=list[ResumenPeriodoIva])
async def iva_periodos(
    anio: int = Query(..., ge=2000, le=2100),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Calcula IVA por período usando los documentos_dian guardados.

    Usa la periodicidad configurada en la empresa (bimestral por default).

    Nota: este endpoint calcula el IVA SEGÚN DIAN — es decir, solo mira lo
    que hay en `documentos_dian`. No toca la tabla `facturas` de la app.
    Es una "vista tributaria oficial" pura. Para la vista contable con IVA
    descontable desde la app + análisis estratégico → tab IVA Estratégico.
    """
    from services.dian_analisis_iva import (
        _cargar_docs_dian_periodo, _separar_ventas_compras, _iva_doc,
        rango_periodo, num_periodos,
    )
    from services.dian_conciliacion import _normalizar_nit as _norm_nit

    periodicidad = empresa.dian_periodicidad or "bimestral"
    empresa_nit_norm = _norm_nit(empresa.nit)

    resumenes: list[ResumenPeriodoIva] = []
    for pnum in range(1, num_periodos(periodicidad) + 1):
        fd, fh, etq = rango_periodo(anio, periodicidad, pnum)
        docs = await _cargar_docs_dian_periodo(db, empresa.id, fd, fh)
        ventas, compras = _separar_ventas_compras(docs, empresa_nit_norm)

        iva_v = sum(_iva_doc(d) for d in ventas)
        iva_c = sum(_iva_doc(d) for d in compras)
        saldo = iva_v - iva_c

        if abs(saldo) < 100:
            situacion = "CERO"
        elif saldo > 0:
            situacion = "A PAGAR"
        else:
            situacion = "A FAVOR"

        resumenes.append(ResumenPeriodoIva(
            etiqueta=etq,
            fecha_desde=fd,
            fecha_hasta=fh,
            docs_ventas=len(ventas),
            docs_compras=len(compras),
            iva_ventas=iva_v,
            iva_compras=iva_c,
            saldo_iva=saldo,
            situacion=situacion,
        ))

    return resumenes


# ============================================================================
# Conciliación facturas app ↔ documentos DIAN
# ============================================================================

@router.get("/conciliacion-dian/conciliacion", response_model=ConciliacionResponse)
async def get_conciliacion(
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    solo_compras: bool = Query(True, description="Cruzar solo compras (default). False para incluir ventas."),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Cruce entre `facturas` (app) y `documentos_dian` (histórico oficial DIAN).

    Devuelve cada renglón con su estado:
      - `coincide`          → match perfecto por CUFE o (nit+prefijo+folio) y valor dentro de tolerancia
      - `diferencia_valor`  → match por id pero valor difiere > $500
      - `solo_en_app`       → factura procesada sin equivalente electrónico en DIAN
      - `solo_en_dian`      → documento oficial DIAN pendiente de procesar en la app

    Y un resumen agregado para KPIs de UI.
    """
    empresa_nit = str(empresa.nit or "").strip()
    if not empresa_nit:
        raise HTTPException(status_code=400, detail="La empresa no tiene NIT configurado.")

    resultados = await conciliar_facturas_vs_dian(
        db=db,
        empresa_id=empresa.id,
        empresa_nit=empresa_nit,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        solo_compras=solo_compras,
    )
    resumen = resumen_conciliacion(resultados)

    return ConciliacionResponse(
        resumen=ConciliacionResumen(**resumen),
        items=[ConciliacionItem(**r.to_dict()) for r in resultados],
    )


# ============================================================================
# Análisis Estratégico de IVA — dashboard combinado
# ============================================================================

@router.get("/conciliacion-dian/analisis-iva", response_model=AnalisisIVAResponse)
async def get_analisis_iva(
    anio: int = Query(..., ge=2000, le=2100),
    periodo_num: int = Query(1, ge=1, le=6, description="Bimestre 1-6, cuatrimestre 1-3, o 1 para anual"),
    periodicidad: Optional[str] = Query(
        None,
        pattern="^(bimestral|cuatrimestral|anual)$",
        description="Si se omite, usa la periodicidad configurada en la empresa.",
    ),
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Dashboard estratégico de IVA para un período específico.

    Combina:
      - IVA generado (ventas) — desde documentos_dian (única fuente)
      - IVA descontable (compras) — desde facturas de la app (autoritativo)
      - IVA no capturado — DIAN recibidos sin factura en la app
      - Tendencia del año — todos los períodos de la periodicidad configurada
      - Top 10 proveedores por IVA
      - Facturas huérfanas (top 20 por impacto)
      - Recomendaciones heurísticas
    """
    empresa_nit = str(empresa.nit or "").strip()
    if not empresa_nit:
        raise HTTPException(status_code=400, detail="La empresa no tiene NIT configurado.")

    periodicidad_efectiva = periodicidad or empresa.dian_periodicidad or "bimestral"

    # Validar coherencia periodo_num vs periodicidad
    limites = {"bimestral": 6, "cuatrimestral": 3, "anual": 1}
    limite = limites.get(periodicidad_efectiva, 6)
    if periodo_num > limite:
        raise HTTPException(
            status_code=400,
            detail=f"Periodicidad {periodicidad_efectiva} solo permite períodos 1-{limite}.",
        )

    try:
        analisis = await analizar_iva_estrategico(
            db=db,
            empresa_id=empresa.id,
            empresa_nit=empresa_nit,
            anio=anio,
            periodicidad=periodicidad_efectiva,
            periodo_num=periodo_num,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return AnalisisIVAResponse(
        anio=analisis.anio,
        periodicidad=analisis.periodicidad,
        periodo_num=analisis.periodo_num,
        etiqueta=analisis.etiqueta,
        fecha_desde=analisis.fecha_desde,
        fecha_hasta=analisis.fecha_hasta,
        kpis=KPIsIVAOut(**analisis.kpis.__dict__),
        tendencia=[TendenciaPeriodoOut(**t.__dict__) for t in analisis.tendencia],
        top_proveedores=[ProveedorTopIVAOut(**p.__dict__) for p in analisis.top_proveedores],
        facturas_no_capturadas=[FacturaHuerfanaOut(**f.__dict__) for f in analisis.facturas_no_capturadas],
        recomendaciones=[RecomendacionOut(**r.__dict__) for r in analisis.recomendaciones],
    )


# ============================================================================
# DEV — cargar documentos DIAN dummy para poder probar sin registro real
# ============================================================================

@router.post("/conciliacion-dian/dev/seed-fixture")
async def seed_fixture(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Siembra un escenario contable realista para probar todo el flujo sin
    depender de un registro DIAN real.

    Solo disponible con settings.DEBUG=True. En producción devuelve 403.

    Escenario armado (4 bimestres del año actual):
      - Documentos DIAN: mezcla de emitidos (ventas) y recibidos (compras)
        para producir tendencia visible en el chart.
      - Proveedores + Facturas app: la mayoría MATCHEA por CUFE con DIAN
        (estado 'coincide'), una tiene diferencia de valor > tolerancia
        (estado 'diferencia_valor'), una es solo_en_app (sin DIAN), y una
        DIAN es solo_en_dian (huérfana — hallazgo estratégico).
      - Una nota de crédito matcheada para probar el ajuste negativo del IVA.

    Idempotente: borra todo el fixture previo (marcado con `sync_job_id=-1`
    y facturas con observaciones que empiezan por `[FIXTURE]`) antes de
    reinsertar.
    """
    if not settings.DEBUG:
        raise HTTPException(
            status_code=403,
            detail="Solo disponible en DEBUG. Setea DEBUG=True en .env.",
        )

    from decimal import Decimal
    from datetime import date as ddate
    from sqlalchemy import delete as sql_delete
    from models import Factura, Proveedor
    from models_dian import DocumentoDian

    empresa_nit = "".join(c for c in str(empresa.nit or "") if c.isdigit()) or "900000000"
    anio = ddate.today().year
    hoy = ddate.today()

    # -----------------------------------------------------------------
    # 1) Limpieza — borra fixture previa
    # -----------------------------------------------------------------
    await db.execute(sql_delete(DocumentoDian).where(
        DocumentoDian.empresa_id == empresa.id,
        DocumentoDian.sync_job_id == -1,
    ))
    await db.execute(sql_delete(Factura).where(
        Factura.empresa_id == empresa.id,
        Factura.observaciones.like("[FIXTURE]%"),
    ))
    await db.commit()

    # -----------------------------------------------------------------
    # 2) Proveedores demo (idempotente vía UniqueConstraint empresa_id+nit)
    # -----------------------------------------------------------------
    proveedores_demo = [
        ("901234567", "GARCÍA & ASOCIADOS CONSULTORES S.A.S."),
        ("900475200", "SEGURIDAD Y ASEO INTEGRAL S.A."),
        ("830022114", "COMBUSTIBLES DEL NORTE S.A.S."),
        ("900555444", "INSUMOS DE PRUEBA S.A.S."),  # solo_en_app
    ]
    proveedor_id_by_nit: dict[str, int] = {}
    for nit, nombre in proveedores_demo:
        existente = (await db.execute(
            select(Proveedor).where(
                Proveedor.empresa_id == empresa.id, Proveedor.nit == nit,
            )
        )).scalar_one_or_none()
        if existente:
            proveedor_id_by_nit[nit] = existente.id
        else:
            p = Proveedor(empresa_id=empresa.id, nit=nit, nombre=nombre)
            db.add(p)
            await db.flush()
            proveedor_id_by_nit[nit] = p.id

    # -----------------------------------------------------------------
    # 3) Documentos DIAN — distribuidos en 4 bimestres
    #    Convención: los que empiezan con `_M` (matched) se replican en app.
    # -----------------------------------------------------------------
    def _doc(cufe, prefijo, folio, tipo_doc, grupo, fecha, nit_emi, nombre_emi,
             valor, iva, ajustado_neg=False):
        v = Decimal(str(valor))
        i = Decimal(str(iva))
        return {
            "cufe": cufe, "prefijo": prefijo, "folio": str(folio),
            "tipo_documento": tipo_doc, "grupo": grupo,
            "fecha_emision": fecha, "fecha_recepcion": fecha,
            "nit_emisor": nit_emi, "nombre_emisor": nombre_emi,
            "nit_receptor": empresa_nit if grupo == "Recibidos" else "890999333",
            "nombre_receptor": (empresa.nombre or "Empresa Demo") if grupo == "Recibidos" else "CLIENTE DEMO S.A.",
            "valor": v, "iva": i,
            "valor_bruto": v - i,
            "valor_ajustado": -v if ajustado_neg else v,
            "iva_ajustado": -i if ajustado_neg else i,
            "estado": "Notificado",
        }

    docs = [
        # ------------ Bim 1 (Ene-Feb) — actividad ligera ------------
        _doc("cufe_bim1_v01", "VTA", "0071", "Factura electrónica", "Emitidos",
             ddate(anio, 1, 22), empresa_nit, empresa.nombre or "Empresa Demo",
             3570000, 570000),
        _doc("cufe_bim1_c01_MATCH", "FE", "00081", "Factura electrónica", "Recibidos",
             ddate(anio, 2, 10), "901234567", "GARCÍA & ASOCIADOS CONSULTORES S.A.S.",
             1785000, 285000),

        # ------------ Bim 2 (Mar-Abr) — subida de actividad ------------
        _doc("cufe_bim2_v01", "VTA", "0080", "Factura electrónica", "Emitidos",
             ddate(anio, 3, 15), empresa_nit, empresa.nombre or "Empresa Demo",
             5950000, 950000),
        _doc("cufe_bim2_v02", "VTA", "0084", "Factura electrónica", "Emitidos",
             ddate(anio, 4, 20), empresa_nit, empresa.nombre or "Empresa Demo",
             4760000, 760000),
        _doc("cufe_bim2_c01_MATCH", "SAI", "32180", "Factura electrónica", "Recibidos",
             ddate(anio, 3, 25), "900475200", "SEGURIDAD Y ASEO INTEGRAL S.A.",
             2380000, 380000),
        _doc("cufe_bim2_c02_MATCH", "COM", "77100", "Factura electrónica", "Recibidos",
             ddate(anio, 4, 8), "830022114", "COMBUSTIBLES DEL NORTE S.A.S.",
             595000, 95000),

        # ------------ Bim 3 (May-Jun) — bimestre principal del demo ------------
        # DIAN venta 1
        _doc("cufe_bim3_v01", "VTA", "0089", "Factura electrónica", "Emitidos",
             ddate(anio, 5, 30), empresa_nit, empresa.nombre or "Empresa Demo",
             5950000, 950000),
        # DIAN venta 2
        _doc("cufe_bim3_v02", "VTA", "0090", "Factura electrónica", "Emitidos",
             ddate(anio, 6, 15), empresa_nit, empresa.nombre or "Empresa Demo",
             11900000, 1900000),
        # Compra 1 — MATCH perfecto por CUFE
        _doc("cufe_bim3_c01_MATCH", "FE", "00101", "Factura electrónica", "Recibidos",
             ddate(anio, 5, 15), "901234567", "GARCÍA & ASOCIADOS CONSULTORES S.A.S.",
             3570000, 570000),
        # Compra 2 — MATCH perfecto por CUFE
        _doc("cufe_bim3_c02_MATCH", "SAI", "32450", "Factura electrónica", "Recibidos",
             ddate(anio, 5, 20), "900475200", "SEGURIDAD Y ASEO INTEGRAL S.A.",
             2380000, 380000),
        # Compra 3 — MATCH pero con DIFERENCIA de valor > tolerancia
        _doc("cufe_bim3_c03_DIFF", "COM", "78300", "Factura electrónica", "Recibidos",
             ddate(anio, 6, 10), "830022114", "COMBUSTIBLES DEL NORTE S.A.S.",
             450000, 71890),
        # Compra 4 — HUÉRFANA (queda solo en DIAN, no en app)
        _doc("cufe_bim3_c04_ORPHAN", "PAP", "20455", "Factura electrónica", "Recibidos",
             ddate(anio, 6, 2), "800199888", "PAPELERÍA CENTRAL LTDA.",
             119000, 19000),
        # Nota crédito — MATCH y en negativo
        _doc("cufe_bim3_nc01_MATCH", "NC", "412", "Nota de crédito electrónica", "Recibidos",
             ddate(anio, 5, 25), "900475200", "SEGURIDAD Y ASEO INTEGRAL S.A.",
             238000, 38000, ajustado_neg=True),
    ]

    # Bim 4 (Jul-Ago) — solo hasta hoy si estamos en julio
    if hoy.month >= 7:
        docs.extend([
            _doc("cufe_bim4_v01", "VTA", "0102", "Factura electrónica", "Emitidos",
                 ddate(anio, 7, min(10, hoy.day)), empresa_nit, empresa.nombre or "Empresa Demo",
                 8330000, 1330000),
            _doc("cufe_bim4_c01_MATCH", "FE", "00120", "Factura electrónica", "Recibidos",
                 ddate(anio, 7, min(5, hoy.day)), "901234567", "GARCÍA & ASOCIADOS CONSULTORES S.A.S.",
                 2380000, 380000),
        ])

    for d in docs:
        db.add(DocumentoDian(empresa_id=empresa.id, sync_job_id=-1, **d))

    # -----------------------------------------------------------------
    # 4) Facturas de la app — replican los DIAN marcados _MATCH
    #    + una diferencia + una solo_en_app
    # -----------------------------------------------------------------
    def _fact(numero, cufe, fecha, valor, iva, nit_prov, obs_extra=""):
        return Factura(
            empresa_id=empresa.id,
            proveedor_id=proveedor_id_by_nit[nit_prov],
            numero_factura=numero,
            cufe=cufe,
            fecha_factura=fecha,
            valor=Decimal(str(valor)),
            iva=Decimal(str(iva)),
            estado="ASIGNADA",
            observaciones=f"[FIXTURE] Escenario demo. {obs_extra}".strip(),
        )

    facturas = [
        # Bim 1 — match
        _fact("FE-00081", "cufe_bim1_c01_MATCH", ddate(anio, 2, 10),
              1785000, 285000, "901234567"),
        # Bim 2 — 2 matches
        _fact("SAI-32180", "cufe_bim2_c01_MATCH", ddate(anio, 3, 25),
              2380000, 380000, "900475200"),
        _fact("COM-77100", "cufe_bim2_c02_MATCH", ddate(anio, 4, 8),
              595000, 95000, "830022114"),
        # Bim 3 — matches + diferencia + solo_en_app
        _fact("FE-00101", "cufe_bim3_c01_MATCH", ddate(anio, 5, 15),
              3570000, 570000, "901234567", "Match perfecto por CUFE."),
        _fact("SAI-32450", "cufe_bim3_c02_MATCH", ddate(anio, 5, 20),
              2380000, 380000, "900475200", "Match perfecto por CUFE."),
        _fact("NC-412", "cufe_bim3_nc01_MATCH", ddate(anio, 5, 25),
              238000, -38000, "900475200", "Nota crédito. IVA negativo."),
        # Diferencia_valor: app=$460.000, DIAN=$450.000 (>$500 tolerancia)
        _fact("COM-78300", "cufe_bim3_c03_DIFF", ddate(anio, 6, 10),
              460000, 71890, "830022114",
              "Diferencia de valor con DIAN — $10.000."),
        # Solo_en_app: no existe en DIAN
        _fact("SPP-9988", None, ddate(anio, 6, 5),
              281250, 45000, "900555444",
              "Solo en app — proveedor no factura electrónico."),
    ]

    # Bim 4 factura matching si ya sembramos DIAN
    if hoy.month >= 7:
        facturas.append(
            _fact("FE-00120", "cufe_bim4_c01_MATCH", ddate(anio, 7, min(5, hoy.day)),
                  2380000, 380000, "901234567")
        )

    for f in facturas:
        db.add(f)

    await db.commit()

    # Verificación post-commit — cuenta lo que efectivamente quedó en BD.
    from sqlalchemy import func as sqlfunc
    total_docs_dian = (await db.execute(
        select(sqlfunc.count(DocumentoDian.id)).where(
            DocumentoDian.empresa_id == empresa.id,
            DocumentoDian.sync_job_id == -1,
        )
    )).scalar_one()
    total_facturas_fixture = (await db.execute(
        select(sqlfunc.count(Factura.id)).where(
            Factura.empresa_id == empresa.id,
            Factura.observaciones.like("[FIXTURE]%"),
        )
    )).scalar_one()

    return {
        "documentos_dian_insertados": len(docs),
        "documentos_dian_en_bd": total_docs_dian,
        "facturas_app_insertadas": len(facturas),
        "facturas_app_en_bd": total_facturas_fixture,
        "proveedores_demo": len(proveedores_demo),
        "escenario": {
            "coincide": sum(1 for d in docs if "_MATCH" in (d.get("cufe") or "")),
            "diferencia_valor": 1,
            "solo_en_app": 1,
            "solo_en_dian": 1,
            "ventas_dian": sum(1 for d in docs if d["grupo"] == "Emitidos"),
        },
    }


@router.get("/conciliacion-dian/dev/inspect")
async def inspect_fixture_state(
    empresa=Depends(get_current_empresa),
    db: AsyncSession = Depends(get_db),
):
    """Endpoint de diagnóstico — cuenta lo que hay en BD para esta empresa.

    Útil para verificar si la fixture se cargó correctamente o si algo se rompió.
    Solo disponible con DEBUG=True.
    """
    if not settings.DEBUG:
        raise HTTPException(status_code=403, detail="Solo disponible en DEBUG.")

    from sqlalchemy import func as sqlfunc
    from models import Factura, Proveedor

    docs_total = (await db.execute(
        select(sqlfunc.count(DocumentoDian.id)).where(
            DocumentoDian.empresa_id == empresa.id,
        )
    )).scalar_one()
    docs_fixture = (await db.execute(
        select(sqlfunc.count(DocumentoDian.id)).where(
            DocumentoDian.empresa_id == empresa.id,
            DocumentoDian.sync_job_id == -1,
        )
    )).scalar_one()
    facturas_total = (await db.execute(
        select(sqlfunc.count(Factura.id)).where(
            Factura.empresa_id == empresa.id,
        )
    )).scalar_one()
    facturas_fixture = (await db.execute(
        select(sqlfunc.count(Factura.id)).where(
            Factura.empresa_id == empresa.id,
            Factura.observaciones.like("[FIXTURE]%"),
        )
    )).scalar_one()
    proveedores = (await db.execute(
        select(sqlfunc.count(Proveedor.id)).where(
            Proveedor.empresa_id == empresa.id,
        )
    )).scalar_one()

    # Muestra de facturas fixture (últimas 15)
    result = await db.execute(
        select(Factura, Proveedor)
        .join(Proveedor, Proveedor.id == Factura.proveedor_id, isouter=True)
        .where(
            Factura.empresa_id == empresa.id,
            Factura.observaciones.like("[FIXTURE]%"),
        )
        .order_by(Factura.fecha_factura.desc())
        .limit(15)
    )
    facturas_muestra = [
        {
            "id": f.id,
            "numero": f.numero_factura,
            "cufe": f.cufe,
            "fecha": f.fecha_factura.isoformat() if f.fecha_factura else None,
            "valor": float(f.valor or 0),
            "iva": float(f.iva) if f.iva is not None else None,
            "proveedor_nit": p.nit if p else None,
            "proveedor_nombre": p.nombre if p else None,
        }
        for f, p in result.all()
    ]

    return {
        "empresa_id": empresa.id,
        "empresa_nombre": empresa.nombre,
        "empresa_nit_raw": empresa.nit,
        "empresa_nit_normalizado": "".join(c for c in str(empresa.nit or "") if c.isdigit()),
        "documentos_dian_total": docs_total,
        "documentos_dian_fixture": docs_fixture,
        "facturas_total": facturas_total,
        "facturas_fixture": facturas_fixture,
        "proveedores_total": proveedores,
        "facturas_fixture_muestra": facturas_muestra,
    }
