"""
Servicio de análisis estratégico de IVA — combina lo que la empresa procesó en
la app (`facturas`) con el histórico oficial DIAN (`documentos_dian`) para
producir KPIs, tendencias, top de proveedores, y recomendaciones accionables.

Modelo mental (importante):

  - IVA GENERADO (ventas) — la app NO captura facturas emitidas por la empresa.
    Se toma exclusivamente del histórico DIAN filtrando docs cuyo nit_emisor
    coincide con el NIT de la empresa.

  - IVA DESCONTABLE (compras) — la app SÍ es la fuente autoritativa: es lo
    que el contador procesó y lo que efectivamente va a la declaración
    (Formulario 300). Puede incluir electrónicas + papel + soportes.

  - IVA NO CAPTURADO — documentos DIAN recibidos (nit_emisor != empresa) que
    no tienen match en `facturas`. Este es el hallazgo estratégico del
    dashboard: es dinero por recuperar si se procesan.

  - SALDO DECLARACIÓN = generado (DIAN) - descontable (app). Lo que
    efectivamente iría al 300 hoy.

  - SALDO SI CAPTURARA TODO = generado - (descontable + no_capturado). Lo
    que podría llegar a pagarse si el equipo captura las facturas huérfanas.

Las recomendaciones se generan a partir de umbrales sobre estos KPIs (no
son mágicas; son heurísticas contables razonables).
"""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Factura, Proveedor
from models_dian import DocumentoDian
from services.dian_conciliacion import (
    _normalizar_nit, _normalizar_folio, _split_numero_factura,
)


# ============================================================================
# UVT — valores oficiales DIAN
# ============================================================================

UVT_VALORES = {
    2022: 38004,
    2023: 42412,
    2024: 47065,
    2025: 49799,
    2026: 52374,
}


def valor_uvt(anio: int) -> float:
    return float(UVT_VALORES.get(anio, UVT_VALORES[max(UVT_VALORES)]))


# ============================================================================
# Rangos de período
# ============================================================================

def rango_periodo(anio: int, periodicidad: str, periodo_num: int) -> tuple[date, date, str]:
    """Devuelve (fecha_desde, fecha_hasta, etiqueta).

    Bimestres 1..6 = ene-feb, mar-abr, may-jun, jul-ago, sep-oct, nov-dic.
    Cuatrimestres 1..3 = ene-abr, may-ago, sep-dic.
    Anual = 1.
    """
    if periodicidad == "bimestral":
        if not 1 <= periodo_num <= 6:
            raise ValueError(f"Bimestre debe estar entre 1 y 6, no {periodo_num}")
        mes_ini = (periodo_num - 1) * 2 + 1
        mes_fin = mes_ini + 1
        etiqueta = f"Bimestre {periodo_num} — {calendar.month_name[mes_ini]}/{calendar.month_name[mes_fin]}"
    elif periodicidad == "cuatrimestral":
        if not 1 <= periodo_num <= 3:
            raise ValueError(f"Cuatrimestre debe estar entre 1 y 3, no {periodo_num}")
        mes_ini = (periodo_num - 1) * 4 + 1
        mes_fin = mes_ini + 3
        etiqueta = f"Cuatrimestre {periodo_num}"
    elif periodicidad == "anual":
        mes_ini, mes_fin = 1, 12
        etiqueta = f"Anual {anio}"
    else:
        raise ValueError(f"Periodicidad desconocida: {periodicidad}")

    ultimo_dia = calendar.monthrange(anio, mes_fin)[1]
    return date(anio, mes_ini, 1), date(anio, mes_fin, ultimo_dia), etiqueta


def num_periodos(periodicidad: str) -> int:
    return {"bimestral": 6, "cuatrimestral": 3, "anual": 1}.get(periodicidad, 6)


# ============================================================================
# Dataclasses de resultado
# ============================================================================

@dataclass
class KPIsIVA:
    iva_generado: float           # DIAN emitidos (ventas)
    iva_descontable_app: float    # facturas app (compras procesadas — autoritativo)
    iva_descontable_dian: float   # DIAN recibidos (compras electrónicas)
    iva_no_capturado: float       # DIAN recibidos sin match en app

    saldo_declaracion: float          # generado - descontable_app
    saldo_si_capturara_todo: float    # generado - (descontable_app + no_capturado)
    situacion: str                    # a_pagar | a_favor | cero

    ratio_captura: float              # ∈[0,1]  (descontable_dian - no_capturado) / descontable_dian
    ratio_descontable_generado: float # descontable_app / generado

    num_ventas_dian: int
    num_compras_app: int
    num_compras_dian: int
    num_no_capturadas: int

    uvt_anio: float


@dataclass
class TendenciaPeriodo:
    etiqueta: str
    fecha_desde: date
    fecha_hasta: date
    iva_generado: float
    iva_descontable: float
    saldo: float
    situacion: str


@dataclass
class ProveedorTopIVA:
    nit: str
    nombre: str
    iva_total: float
    num_docs: int


@dataclass
class FacturaHuerfana:
    documento_dian_id: int
    cufe: Optional[str]
    prefijo: Optional[str]
    folio: Optional[str]
    nit_emisor: Optional[str]
    nombre_emisor: Optional[str]
    fecha_emision: Optional[date]
    valor: float
    iva: float


@dataclass
class Recomendacion:
    tipo: str        # captura | ratio_bajo | timing_compras | saldo_favor | tendencia
    severidad: str   # info | warning | critical
    titulo: str
    mensaje: str
    impacto_estimado_cop: float


@dataclass
class AnalisisIVA:
    anio: int
    periodicidad: str
    periodo_num: int
    etiqueta: str
    fecha_desde: date
    fecha_hasta: date
    kpis: KPIsIVA
    tendencia: list[TendenciaPeriodo]
    top_proveedores: list[ProveedorTopIVA]
    facturas_no_capturadas: list[FacturaHuerfana]
    recomendaciones: list[Recomendacion]


# ============================================================================
# Consultas atómicas
# ============================================================================

def _iva_doc(d: DocumentoDian) -> float:
    """Prefiere iva_ajustado (con signo NC) sobre iva bruto."""
    val = d.iva_ajustado if d.iva_ajustado is not None else d.iva
    return float(val or 0)


def _valor_doc(d: DocumentoDian) -> float:
    val = d.valor_ajustado if d.valor_ajustado is not None else d.valor
    return float(val or 0)


async def _cargar_docs_dian_periodo(
    db: AsyncSession,
    empresa_id: int,
    fecha_desde: date,
    fecha_hasta: date,
) -> list[DocumentoDian]:
    result = await db.execute(
        select(DocumentoDian).where(
            DocumentoDian.empresa_id == empresa_id,
            DocumentoDian.fecha_emision >= fecha_desde,
            DocumentoDian.fecha_emision <= fecha_hasta,
        )
    )
    return list(result.scalars().all())


async def _cargar_facturas_app_periodo(
    db: AsyncSession,
    empresa_id: int,
    fecha_desde: date,
    fecha_hasta: date,
) -> list[tuple[Factura, Optional[Proveedor]]]:
    stmt = (
        select(Factura, Proveedor)
        .join(Proveedor, Proveedor.id == Factura.proveedor_id, isouter=True)
        .where(
            Factura.empresa_id == empresa_id,
            Factura.fecha_factura >= fecha_desde,
            Factura.fecha_factura <= fecha_hasta,
        )
    )
    result = await db.execute(stmt)
    return list(result.all())


def _separar_ventas_compras(
    docs: list[DocumentoDian],
    empresa_nit_norm: str,
) -> tuple[list[DocumentoDian], list[DocumentoDian]]:
    ventas: list[DocumentoDian] = []
    compras: list[DocumentoDian] = []
    for d in docs:
        if _normalizar_nit(d.nit_emisor) == empresa_nit_norm:
            ventas.append(d)
        else:
            compras.append(d)
    return ventas, compras


def _indexar_facturas(
    facturas_rows: list[tuple[Factura, Optional[Proveedor]]],
) -> tuple[set[str], set[tuple[str, str, str]]]:
    """Genera los índices para determinar si una DIAN compra está capturada."""
    cufes: set[str] = set()
    folios: set[tuple[str, str, str]] = set()
    for f, prov in facturas_rows:
        cufe = (f.cufe or "").strip()
        if cufe:
            cufes.add(cufe)
        pref, fol = _split_numero_factura(f.numero_factura)
        nit_emi = _normalizar_nit(prov.nit if prov else "")
        if fol:
            folios.add((nit_emi, pref, _normalizar_folio(fol)))
    return cufes, folios


def _es_doc_capturado(
    d: DocumentoDian,
    cufes_app: set[str],
    folios_app: set[tuple[str, str, str]],
) -> bool:
    cufe = (d.cufe or "").strip()
    if cufe and cufe in cufes_app:
        return True
    key = (
        _normalizar_nit(d.nit_emisor),
        (d.prefijo or "").strip(),
        _normalizar_folio(d.folio),
    )
    return key in folios_app


def _iva_facturas_app(facturas_rows: list[tuple[Factura, Optional[Proveedor]]]) -> tuple[float, int]:
    """Suma el IVA de las facturas de la app y cuenta cuántas tienen IVA declarado.

    Convención: `Factura.iva` es NULL cuando el n8n no pudo extraerlo. En ese
    caso se ignora del cálculo pero se cuenta (no queremos sub-reportar por
    fallas de extracción).
    """
    total = 0.0
    count = 0
    for f, _ in facturas_rows:
        if f.iva is not None:
            total += float(f.iva)
            count += 1
    return total, count


# ============================================================================
# Top proveedores por IVA descontable
# ============================================================================

def _top_proveedores(
    compras_dian: list[DocumentoDian],
    top_n: int = 10,
) -> list[ProveedorTopIVA]:
    agrupado: dict[str, list] = {}
    for d in compras_dian:
        nit = (d.nit_emisor or "").strip() or "SIN_NIT"
        entry = agrupado.setdefault(nit, [d.nombre_emisor or "", 0.0, 0])
        # Preferir el nombre más largo (suele ser el más completo)
        if d.nombre_emisor and len(d.nombre_emisor) > len(entry[0]):
            entry[0] = d.nombre_emisor
        entry[1] += _iva_doc(d)
        entry[2] += 1

    tops = [
        ProveedorTopIVA(nit=n, nombre=v[0], iva_total=v[1], num_docs=v[2])
        for n, v in agrupado.items()
        if v[1] > 0
    ]
    tops.sort(key=lambda p: p.iva_total, reverse=True)
    return tops[:top_n]


# ============================================================================
# Tendencia — datos de todo el año agrupados por período
# ============================================================================

async def _tendencia_anio(
    db: AsyncSession,
    empresa_id: int,
    empresa_nit_norm: str,
    anio: int,
    periodicidad: str,
) -> list[TendenciaPeriodo]:
    total_periodos = num_periodos(periodicidad)
    salida: list[TendenciaPeriodo] = []

    for pnum in range(1, total_periodos + 1):
        fd, fh, etq = rango_periodo(anio, periodicidad, pnum)

        docs = await _cargar_docs_dian_periodo(db, empresa_id, fd, fh)
        ventas, _ = _separar_ventas_compras(docs, empresa_nit_norm)
        iva_gen = sum(_iva_doc(d) for d in ventas)

        facturas = await _cargar_facturas_app_periodo(db, empresa_id, fd, fh)
        iva_desc, _ = _iva_facturas_app(facturas)

        saldo = iva_gen - iva_desc
        if abs(saldo) < 100:
            sit = "cero"
        elif saldo > 0:
            sit = "a_pagar"
        else:
            sit = "a_favor"

        salida.append(TendenciaPeriodo(
            etiqueta=f"P{pnum}",
            fecha_desde=fd,
            fecha_hasta=fh,
            iva_generado=iva_gen,
            iva_descontable=iva_desc,
            saldo=saldo,
            situacion=sit,
        ))
    return salida


# ============================================================================
# Recomendaciones (heurísticas basadas en contabilidad colombiana)
# ============================================================================

def _fmt_cop(v: float) -> str:
    """Formato COP colombiano — miles con puntos, sin decimales."""
    signo = "-" if v < 0 else ""
    entero = f"{abs(int(round(v))):,}".replace(",", ".")
    return f"{signo}${entero}"


def _generar_recomendaciones(
    kpis: KPIsIVA,
    huerfanas: list[FacturaHuerfana],
    tendencia: list[TendenciaPeriodo],
    periodo_num: int,
) -> list[Recomendacion]:
    recs: list[Recomendacion] = []

    # 1. IVA no capturado — hallazgo principal
    if kpis.iva_generado > 0 and kpis.iva_no_capturado > kpis.iva_generado * 0.05:
        recs.append(Recomendacion(
            tipo="captura",
            severidad="critical",
            titulo="Alto volumen de IVA sin capturar",
            mensaje=(
                f"Hay {_fmt_cop(kpis.iva_no_capturado)} en IVA de {kpis.num_no_capturadas} "
                f"facturas registradas en DIAN que no están procesadas en la app. "
                f"Capturándolas, el saldo declaración pasaría de {_fmt_cop(kpis.saldo_declaracion)} "
                f"a {_fmt_cop(kpis.saldo_si_capturara_todo)}."
            ),
            impacto_estimado_cop=kpis.iva_no_capturado,
        ))
    elif kpis.iva_no_capturado > 0:
        recs.append(Recomendacion(
            tipo="captura",
            severidad="info",
            titulo="Facturas menores sin capturar",
            mensaje=(
                f"{kpis.num_no_capturadas} facturas por {_fmt_cop(kpis.iva_no_capturado)} de IVA. "
                f"Impacto bajo pero conviene procesarlas para tener la contabilidad al día."
            ),
            impacto_estimado_cop=kpis.iva_no_capturado,
        ))

    # 2. Ratio descontable / generado
    if kpis.iva_generado > 0:
        ratio = kpis.ratio_descontable_generado
        if ratio < 0.20:
            recs.append(Recomendacion(
                tipo="ratio_bajo",
                severidad="warning",
                titulo="Ratio IVA descontable/generado bajo",
                mensaje=(
                    f"El IVA descontable es solo el {ratio * 100:.1f}% del generado. "
                    f"En sectores de servicios este ratio es normal; en comercio suele "
                    f"estar entre 60-85%. Revisa si tienes proveedores en régimen "
                    f"no responsable de IVA o facturas de insumos sin capturar."
                ),
                impacto_estimado_cop=0,
            ))

    # 3. Timing de compras / saldo
    if kpis.situacion == "a_pagar":
        recs.append(Recomendacion(
            tipo="timing_compras",
            severidad="info",
            titulo="Saldo a pagar — evalúa compras planeadas",
            mensaje=(
                f"Saldo a pagar estimado: {_fmt_cop(kpis.saldo_declaracion)}. "
                f"Cada $100 en compras con IVA 19% reduce el pago en $19. "
                f"Adelantar compras necesarias planificadas dentro del período baja el pago; "
                f"evita compras artificiales sin sustancia comercial (elusión — Art. 869 ET)."
            ),
            impacto_estimado_cop=kpis.saldo_declaracion,
        ))
    elif kpis.situacion == "a_favor":
        recs.append(Recomendacion(
            tipo="saldo_favor",
            severidad="info",
            titulo="Saldo a favor — arrastre o devolución",
            mensaje=(
                f"Saldo a favor: {_fmt_cop(abs(kpis.saldo_declaracion))}. "
                f"Puedes arrastrarlo al siguiente período (Art. 815 ET) o solicitar "
                f"devolución si supera el umbral vigente (Art. 850 ET)."
            ),
            impacto_estimado_cop=abs(kpis.saldo_declaracion),
        ))

    # 4. Tendencia — comparar contra período anterior
    if 2 <= periodo_num <= len(tendencia):
        actual = tendencia[periodo_num - 1]
        anterior = tendencia[periodo_num - 2]
        if anterior.saldo != 0:
            delta_saldo = actual.saldo - anterior.saldo
            if delta_saldo > 0 and actual.saldo > 0 and delta_saldo > abs(anterior.saldo) * 0.30:
                recs.append(Recomendacion(
                    tipo="tendencia",
                    severidad="warning",
                    titulo="Saldo a pagar creciendo",
                    mensaje=(
                        f"El saldo pasó de {_fmt_cop(anterior.saldo)} a {_fmt_cop(actual.saldo)} "
                        f"({(delta_saldo/max(abs(anterior.saldo),1))*100:+.0f}%). "
                        f"Revisa si hay ventas nuevas sin descontar equivalente, o si el "
                        f"volumen de compras bajó por debajo de lo habitual."
                    ),
                    impacto_estimado_cop=delta_saldo,
                ))

    return recs


# ============================================================================
# Entry point
# ============================================================================

async def analizar_iva_estrategico(
    db: AsyncSession,
    empresa_id: int,
    empresa_nit: str,
    anio: int,
    periodicidad: str,
    periodo_num: int,
) -> AnalisisIVA:
    empresa_nit_norm = _normalizar_nit(empresa_nit)
    fecha_desde, fecha_hasta, etiqueta = rango_periodo(anio, periodicidad, periodo_num)

    # Cargar datos del período
    docs = await _cargar_docs_dian_periodo(db, empresa_id, fecha_desde, fecha_hasta)
    ventas_dian, compras_dian = _separar_ventas_compras(docs, empresa_nit_norm)
    facturas_rows = await _cargar_facturas_app_periodo(db, empresa_id, fecha_desde, fecha_hasta)

    # IVA generado — solo DIAN emitidos
    iva_generado = sum(_iva_doc(d) for d in ventas_dian)

    # IVA descontable — app (autoritativo) + DIAN (para calcular no_capturado)
    iva_descontable_app, count_facturas_con_iva = _iva_facturas_app(facturas_rows)
    iva_descontable_dian = sum(_iva_doc(d) for d in compras_dian)

    # Facturas huérfanas — DIAN recibidos sin match en app
    cufes_app, folios_app = _indexar_facturas(facturas_rows)
    huerfanas: list[FacturaHuerfana] = []
    for d in compras_dian:
        if _es_doc_capturado(d, cufes_app, folios_app):
            continue
        huerfanas.append(FacturaHuerfana(
            documento_dian_id=d.id,
            cufe=d.cufe,
            prefijo=d.prefijo,
            folio=d.folio,
            nit_emisor=d.nit_emisor,
            nombre_emisor=d.nombre_emisor,
            fecha_emision=d.fecha_emision,
            valor=_valor_doc(d),
            iva=_iva_doc(d),
        ))
    huerfanas.sort(key=lambda h: h.iva, reverse=True)

    iva_no_capturado = sum(h.iva for h in huerfanas)

    # Saldos
    saldo_declaracion = iva_generado - iva_descontable_app
    saldo_si_capturara = iva_generado - (iva_descontable_app + iva_no_capturado)

    if abs(saldo_declaracion) < 100:
        situacion = "cero"
    elif saldo_declaracion > 0:
        situacion = "a_pagar"
    else:
        situacion = "a_favor"

    # Ratios — captura basada en CONTEO de documentos (no en $), para que
    # la NC con IVA negativo no rompa el porcentaje. Interpretación: "% de
    # facturas DIAN de compra que están procesadas en la app".
    ratio_captura = 0.0
    if len(compras_dian) > 0:
        capturados = len(compras_dian) - len(huerfanas)
        ratio_captura = max(0.0, min(1.0, capturados / len(compras_dian)))

    ratio_desc_gen = 0.0
    if iva_generado > 0:
        ratio_desc_gen = iva_descontable_app / iva_generado

    kpis = KPIsIVA(
        iva_generado=iva_generado,
        iva_descontable_app=iva_descontable_app,
        iva_descontable_dian=iva_descontable_dian,
        iva_no_capturado=iva_no_capturado,
        saldo_declaracion=saldo_declaracion,
        saldo_si_capturara_todo=saldo_si_capturara,
        situacion=situacion,
        ratio_captura=ratio_captura,
        ratio_descontable_generado=ratio_desc_gen,
        num_ventas_dian=len(ventas_dian),
        num_compras_app=len(facturas_rows),
        num_compras_dian=len(compras_dian),
        num_no_capturadas=len(huerfanas),
        uvt_anio=valor_uvt(anio),
    )

    top_prov = _top_proveedores(compras_dian, top_n=10)
    tendencia = await _tendencia_anio(db, empresa_id, empresa_nit_norm, anio, periodicidad)
    recomendaciones = _generar_recomendaciones(kpis, huerfanas, tendencia, periodo_num)

    return AnalisisIVA(
        anio=anio,
        periodicidad=periodicidad,
        periodo_num=periodo_num,
        etiqueta=etiqueta,
        fecha_desde=fecha_desde,
        fecha_hasta=fecha_hasta,
        kpis=kpis,
        tendencia=tendencia,
        top_proveedores=top_prov,
        facturas_no_capturadas=huerfanas[:20],
        recomendaciones=recomendaciones,
    )
