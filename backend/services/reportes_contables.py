"""
Servicio de reportes contables formales (Balance General, P&L, Retenciones).

Cada función expone dos formatos:
  - JSON: para que el frontend los renderice en pantalla.
  - Bytes (CSV/PDF): para descargar.

PDF se genera con reportlab (instalado), CSV con csv stdlib.
"""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal
from typing import Optional

from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from models_contabilidad import AsientoContable, LineaAsiento, CuentaPUC


def _format_cop(v: Decimal | float | int) -> str:
    return f"$ {v:,.0f}".replace(",", ".")


# =========================================================================
# Balance General — Activos / Pasivos / Patrimonio a una fecha
# =========================================================================
async def balance_general_data(
    *,
    empresa_id: int,
    fecha_corte: date,
    centro_costo: Optional[str],
    db: AsyncSession,
) -> dict:
    """
    Devuelve { activos: [(codigo, nombre, saldo)], pasivos: [...], patrimonio: [...],
               total_activos, total_pasivos, total_patrimonio, ecuacion_cuadra }
    Filtra opcionalmente por centro_costo.
    """
    stmt = (
        select(
            LineaAsiento.cuenta_codigo,
            CuentaPUC.nombre,
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.debito), 0).label("db_"),
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito), 0).label("cr"),
        )
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .join(
            CuentaPUC,
            (CuentaPUC.codigo == LineaAsiento.cuenta_codigo)
            & (CuentaPUC.empresa_id == empresa_id),
            isouter=True,
        )
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.estado == "APROBADO",
            AsientoContable.fecha <= fecha_corte,
            LineaAsiento.cuenta_codigo.regexp_match("^[123]"),
        )
        .group_by(LineaAsiento.cuenta_codigo, CuentaPUC.nombre)
        .order_by(LineaAsiento.cuenta_codigo)
    )
    if centro_costo:
        stmt = stmt.where(LineaAsiento.centro_costo == centro_costo)

    rows = (await db.execute(stmt)).all()

    activos, pasivos, patrimonio = [], [], []
    total_activos = total_pasivos = total_patrimonio = Decimal("0")

    for codigo, nombre, db_, cr in rows:
        saldo = Decimal(db_) - Decimal(cr)
        if saldo == 0:
            continue
        # Activos naturaleza débito → saldo positivo es DR
        # Pasivos/Patrimonio naturaleza crédito → mostrar |saldo CR|
        item = {"codigo": codigo, "nombre": nombre or "—"}
        if codigo.startswith("1"):
            item["saldo"] = saldo  # DR
            activos.append(item)
            total_activos += saldo
        elif codigo.startswith("2"):
            item["saldo"] = -saldo  # invertir para mostrar como positivo
            pasivos.append(item)
            total_pasivos += -saldo
        elif codigo.startswith("3"):
            item["saldo"] = -saldo
            patrimonio.append(item)
            total_patrimonio += -saldo

    return {
        "fecha_corte": fecha_corte.isoformat(),
        "centro_costo": centro_costo,
        "activos": activos,
        "pasivos": pasivos,
        "patrimonio": patrimonio,
        "total_activos": total_activos,
        "total_pasivos": total_pasivos,
        "total_patrimonio": total_patrimonio,
        "ecuacion_cuadra": total_activos == (total_pasivos + total_patrimonio),
    }


# =========================================================================
# Estado de Resultados (P&L) — Ingresos − Gastos − Costos = Utilidad
# =========================================================================
async def estado_resultados_data(
    *,
    empresa_id: int,
    fecha_desde: date,
    fecha_hasta: date,
    centro_costo: Optional[str],
    db: AsyncSession,
) -> dict:
    stmt = (
        select(
            LineaAsiento.cuenta_codigo,
            CuentaPUC.nombre,
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.debito), 0).label("db_"),
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito), 0).label("cr"),
        )
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .join(
            CuentaPUC,
            (CuentaPUC.codigo == LineaAsiento.cuenta_codigo)
            & (CuentaPUC.empresa_id == empresa_id),
            isouter=True,
        )
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.estado == "APROBADO",
            AsientoContable.fecha >= fecha_desde,
            AsientoContable.fecha <= fecha_hasta,
            LineaAsiento.cuenta_codigo.regexp_match("^[456]"),
        )
        .group_by(LineaAsiento.cuenta_codigo, CuentaPUC.nombre)
        .order_by(LineaAsiento.cuenta_codigo)
    )
    if centro_costo:
        stmt = stmt.where(LineaAsiento.centro_costo == centro_costo)

    rows = (await db.execute(stmt)).all()

    ingresos, gastos, costos = [], [], []
    total_ingresos = total_gastos = total_costos = Decimal("0")

    for codigo, nombre, db_, cr in rows:
        saldo = Decimal(cr) - Decimal(db_)
        item = {"codigo": codigo, "nombre": nombre or "—"}
        if codigo.startswith("4"):
            if saldo == 0:
                continue
            item["saldo"] = saldo
            ingresos.append(item)
            total_ingresos += saldo
        elif codigo.startswith("5"):
            saldo_dr = -saldo  # gastos: saldo natural DR, usamos positivo
            if saldo_dr == 0:
                continue
            item["saldo"] = saldo_dr
            gastos.append(item)
            total_gastos += saldo_dr
        elif codigo.startswith("6"):
            saldo_dr = -saldo
            if saldo_dr == 0:
                continue
            item["saldo"] = saldo_dr
            costos.append(item)
            total_costos += saldo_dr

    utilidad_neta = total_ingresos - total_gastos - total_costos

    return {
        "fecha_desde": fecha_desde.isoformat(),
        "fecha_hasta": fecha_hasta.isoformat(),
        "centro_costo": centro_costo,
        "ingresos": ingresos,
        "gastos": gastos,
        "costos": costos,
        "total_ingresos": total_ingresos,
        "total_gastos": total_gastos,
        "total_costos": total_costos,
        "utilidad_neta": utilidad_neta,
    }


# =========================================================================
# Retenciones practicadas — agrupadas por proveedor + concepto DIAN
# =========================================================================
async def retenciones_data(
    *,
    empresa_id: int,
    anio: int,
    db: AsyncSession,
) -> dict:
    """
    Suma retefuente, ReteIVA y ReteICA practicadas por proveedor en el año.
    Filtra cuentas 2365xx, 2367xx, 2368xx (CR neto = retención practicada).
    """
    stmt = (
        select(
            LineaAsiento.nit_tercero,
            LineaAsiento.cuenta_codigo,
            LineaAsiento.concepto_dian,
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.credito - LineaAsiento.debito), 0).label("retenido"),
            sqlfunc.coalesce(sqlfunc.sum(LineaAsiento.base_impuesto), 0).label("base"),
        )
        .join(AsientoContable, AsientoContable.id == LineaAsiento.asiento_id)
        .where(
            AsientoContable.empresa_id == empresa_id,
            AsientoContable.estado == "APROBADO",
            sqlfunc.extract("year", AsientoContable.fecha) == anio,
            LineaAsiento.cuenta_codigo.regexp_match("^236[578]"),
        )
        .group_by(LineaAsiento.nit_tercero, LineaAsiento.cuenta_codigo, LineaAsiento.concepto_dian)
        .order_by(LineaAsiento.nit_tercero, LineaAsiento.cuenta_codigo)
    )
    rows = (await db.execute(stmt)).all()

    items = []
    total_retefuente = total_reteiva = total_reteica = Decimal("0")
    for nit, cuenta, concepto, retenido, base in rows:
        retenido = Decimal(retenido or 0)
        if retenido <= 0:
            continue
        tipo = (
            "Retefuente" if cuenta.startswith("2365") else
            "ReteIVA" if cuenta.startswith("2367") else
            "ReteICA" if cuenta.startswith("2368") else "Otro"
        )
        items.append({
            "nit_tercero": nit,
            "cuenta": cuenta,
            "concepto_dian": concepto,
            "tipo_retencion": tipo,
            "base": Decimal(base or 0),
            "retenido": retenido,
        })
        if tipo == "Retefuente":
            total_retefuente += retenido
        elif tipo == "ReteIVA":
            total_reteiva += retenido
        elif tipo == "ReteICA":
            total_reteica += retenido

    return {
        "anio": anio,
        "items": items,
        "total_retefuente": total_retefuente,
        "total_reteiva": total_reteiva,
        "total_reteica": total_reteica,
        "total_general": total_retefuente + total_reteiva + total_reteica,
    }


# =========================================================================
# CSV exporters
# =========================================================================
def balance_general_csv(data: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["BALANCE GENERAL", f"Fecha corte: {data['fecha_corte']}"])
    if data.get("centro_costo"):
        w.writerow(["Centro de costo:", data["centro_costo"]])
    w.writerow([])
    w.writerow(["ACTIVOS"])
    w.writerow(["Código", "Nombre", "Saldo"])
    for it in data["activos"]:
        w.writerow([it["codigo"], it["nombre"], f"{it['saldo']:.2f}"])
    w.writerow(["", "TOTAL ACTIVOS", f"{data['total_activos']:.2f}"])
    w.writerow([])
    w.writerow(["PASIVOS"])
    w.writerow(["Código", "Nombre", "Saldo"])
    for it in data["pasivos"]:
        w.writerow([it["codigo"], it["nombre"], f"{it['saldo']:.2f}"])
    w.writerow(["", "TOTAL PASIVOS", f"{data['total_pasivos']:.2f}"])
    w.writerow([])
    w.writerow(["PATRIMONIO"])
    w.writerow(["Código", "Nombre", "Saldo"])
    for it in data["patrimonio"]:
        w.writerow([it["codigo"], it["nombre"], f"{it['saldo']:.2f}"])
    w.writerow(["", "TOTAL PATRIMONIO", f"{data['total_patrimonio']:.2f}"])
    w.writerow([])
    w.writerow(["", "ECUACIÓN CONTABLE",
                "✓ Cuadra" if data["ecuacion_cuadra"] else "⚠ NO CUADRA"])
    return buf.getvalue().encode("utf-8-sig")


def estado_resultados_csv(data: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["ESTADO DE RESULTADOS",
                f"Periodo: {data['fecha_desde']} a {data['fecha_hasta']}"])
    if data.get("centro_costo"):
        w.writerow(["Centro de costo:", data["centro_costo"]])
    w.writerow([])
    for nombre_grupo, key, tot_key in [
        ("INGRESOS", "ingresos", "total_ingresos"),
        ("GASTOS", "gastos", "total_gastos"),
        ("COSTOS", "costos", "total_costos"),
    ]:
        w.writerow([nombre_grupo])
        w.writerow(["Código", "Nombre", "Saldo"])
        for it in data[key]:
            w.writerow([it["codigo"], it["nombre"], f"{it['saldo']:.2f}"])
        w.writerow(["", f"TOTAL {nombre_grupo}", f"{data[tot_key]:.2f}"])
        w.writerow([])
    w.writerow(["", "UTILIDAD NETA", f"{data['utilidad_neta']:.2f}"])
    return buf.getvalue().encode("utf-8-sig")


def retenciones_csv(data: dict) -> bytes:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["RETENCIONES PRACTICADAS", f"Año: {data['anio']}"])
    w.writerow([])
    w.writerow(["NIT Tercero", "Cuenta PUC", "Concepto DIAN", "Tipo", "Base", "Retenido"])
    for it in data["items"]:
        w.writerow([
            it["nit_tercero"], it["cuenta"], it["concepto_dian"] or "—",
            it["tipo_retencion"], f"{it['base']:.2f}", f"{it['retenido']:.2f}",
        ])
    w.writerow([])
    w.writerow(["", "Total Retefuente", "", "", "", f"{data['total_retefuente']:.2f}"])
    w.writerow(["", "Total ReteIVA", "", "", "", f"{data['total_reteiva']:.2f}"])
    w.writerow(["", "Total ReteICA", "", "", "", f"{data['total_reteica']:.2f}"])
    w.writerow(["", "TOTAL GENERAL", "", "", "", f"{data['total_general']:.2f}"])
    return buf.getvalue().encode("utf-8-sig")


# =========================================================================
# PDF exporters (reportlab)
# =========================================================================
def _pdf_simple_report(titulo: str, subtitulo: str, secciones: list[dict]) -> bytes:
    """
    Genera un PDF simple con título, subtítulo y secciones tipo:
      [{"nombre": "ACTIVOS", "headers": [..], "rows": [[..],..], "totales": [..]}, ...]
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import LETTER
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    )

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=LETTER,
                            leftMargin=0.5 * inch, rightMargin=0.5 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.5 * inch)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", parent=styles["Title"], fontSize=14, spaceAfter=4)
    sub_style = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.grey, spaceAfter=14)
    sec_style = ParagraphStyle("sec", parent=styles["Heading2"], fontSize=11, spaceBefore=10, spaceAfter=4)

    story = [Paragraph(titulo, title_style), Paragraph(subtitulo, sub_style)]
    for s in secciones:
        story.append(Paragraph(s["nombre"], sec_style))
        data = [s["headers"]] + s["rows"]
        if s.get("totales"):
            data.append(s["totales"])
        t = Table(data, colWidths=s.get("col_widths"))
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (-1, 1), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#e5e7eb")),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ]))
        story.append(t)
        story.append(Spacer(1, 8))
    doc.build(story)
    return buf.getvalue()


def balance_general_pdf(data: dict) -> bytes:
    secciones = []
    for nombre_grupo, key, tot_key in [
        ("ACTIVOS", "activos", "total_activos"),
        ("PASIVOS", "pasivos", "total_pasivos"),
        ("PATRIMONIO", "patrimonio", "total_patrimonio"),
    ]:
        rows = [[it["codigo"], it["nombre"], _format_cop(it["saldo"])] for it in data[key]]
        secciones.append({
            "nombre": nombre_grupo,
            "headers": ["Código", "Nombre", "Saldo"],
            "rows": rows,
            "totales": ["", f"TOTAL {nombre_grupo}", _format_cop(data[tot_key])],
            "col_widths": [60, 320, 110],
        })
    secciones.append({
        "nombre": "Verificación de Ecuación Contable",
        "headers": ["Concepto", "Valor"],
        "rows": [
            ["Total Activos", _format_cop(data["total_activos"])],
            ["Total Pasivos + Patrimonio",
             _format_cop(data["total_pasivos"] + data["total_patrimonio"])],
            ["Cuadra", "✓ Sí" if data["ecuacion_cuadra"] else "✗ NO"],
        ],
        "col_widths": [350, 140],
    })
    sub = f"Fecha de corte: {data['fecha_corte']}"
    if data.get("centro_costo"):
        sub += f" — Centro de costo: {data['centro_costo']}"
    return _pdf_simple_report("BALANCE GENERAL", sub, secciones)


def estado_resultados_pdf(data: dict) -> bytes:
    secciones = []
    for nombre_grupo, key, tot_key in [
        ("INGRESOS", "ingresos", "total_ingresos"),
        ("GASTOS", "gastos", "total_gastos"),
        ("COSTOS", "costos", "total_costos"),
    ]:
        rows = [[it["codigo"], it["nombre"], _format_cop(it["saldo"])] for it in data[key]]
        secciones.append({
            "nombre": nombre_grupo,
            "headers": ["Código", "Nombre", "Saldo"],
            "rows": rows,
            "totales": ["", f"TOTAL {nombre_grupo}", _format_cop(data[tot_key])],
            "col_widths": [60, 320, 110],
        })
    secciones.append({
        "nombre": "Resultado del Período",
        "headers": ["Concepto", "Valor"],
        "rows": [
            ["Total Ingresos", _format_cop(data["total_ingresos"])],
            ["Total Gastos", _format_cop(data["total_gastos"])],
            ["Total Costos", _format_cop(data["total_costos"])],
            ["UTILIDAD NETA", _format_cop(data["utilidad_neta"])],
        ],
        "col_widths": [350, 140],
    })
    sub = f"Periodo: {data['fecha_desde']} a {data['fecha_hasta']}"
    if data.get("centro_costo"):
        sub += f" — Centro de costo: {data['centro_costo']}"
    return _pdf_simple_report("ESTADO DE RESULTADOS", sub, secciones)


def retenciones_pdf(data: dict) -> bytes:
    rows = [
        [
            it["nit_tercero"],
            it["cuenta"],
            it["concepto_dian"] or "—",
            it["tipo_retencion"],
            _format_cop(it["base"]),
            _format_cop(it["retenido"]),
        ]
        for it in data["items"]
    ]
    secciones = [{
        "nombre": "Detalle por Tercero",
        "headers": ["NIT", "Cuenta PUC", "Concepto DIAN", "Tipo", "Base", "Retenido"],
        "rows": rows,
        "totales": ["", "", "", "TOTAL", "", _format_cop(data["total_general"])],
        "col_widths": [80, 60, 100, 70, 90, 90],
    }, {
        "nombre": "Resumen por Tipo",
        "headers": ["Tipo", "Total"],
        "rows": [
            ["Retefuente", _format_cop(data["total_retefuente"])],
            ["ReteIVA", _format_cop(data["total_reteiva"])],
            ["ReteICA", _format_cop(data["total_reteica"])],
        ],
        "col_widths": [350, 140],
    }]
    return _pdf_simple_report(
        "CERTIFICADO DE RETENCIONES PRACTICADAS",
        f"Año fiscal: {data['anio']}",
        secciones,
    )
