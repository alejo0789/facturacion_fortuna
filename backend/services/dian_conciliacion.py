"""
Servicio de conciliación: cruza `facturas` (facturas de la app, procesadas por
el usuario o por el asistente n8n) contra `documentos_dian` (histórico oficial
descargado del portal DIAN).

Objetivos contables:
  1. Detectar facturas en la app que NO existen en DIAN → posible error de
     captura, CUFE mal digitado, o factura no electrónica (proveedor no
     obligado). Sin match en DIAN → riesgo tributario para descontar IVA.
  2. Detectar documentos en DIAN que NO están procesados en la app →
     facturas que llegaron al buzón electrónico pero el equipo contable
     todavía no las registró. Especialmente importantes: las de compras
     (IVA descontable no aprovechado).
  3. Detectar discrepancias de valor: match por identificador pero diferencia
     monetaria > tolerancia → error de digitación o modificación indebida.

Estrategia de match (por prioridad):
  a) CUFE exacto (100% confiable).
  b) (nit_emisor + prefijo + folio) — fallback cuando el CUFE no se capturó
     en la app (columna `cufe` en `facturas` puede estar NULL).

Toleran diferencias:
  - Valor: ±$500 (redondeos de retenciones, IVA calculado a distintos decimales).
  - Fecha: el match es por identificador, la fecha solo se reporta.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Factura, Proveedor  # ORM legado en la carpeta backend/
from models_dian import DocumentoDian


# Tolerancia de valor para considerar match (COP). Ajustar si sale muy sensible.
TOLERANCIA_VALOR_COP = 500.0


def _normalizar_nit(nit: Optional[str]) -> str:
    """Deja solo los dígitos del NIT (sin puntos, guiones, ni DV)."""
    if not nit:
        return ""
    # Quitar todo lo que no sea dígito. Si viene con DV (XXX-Y), quedan solo dígitos.
    solo_digitos = re.sub(r"[^\d]", "", str(nit))
    # Convención en la app: guardar sin DV. Si vinieron 10 dígitos y el último es
    # el DV, no lo podemos saber con certeza — dejamos todos y el match cae al
    # normalizado de ambos lados.
    return solo_digitos


def _normalizar_folio(folio: Optional[str]) -> str:
    if not folio:
        return ""
    return str(folio).strip().lstrip("0") or "0"


def _split_numero_factura(numero: Optional[str]) -> tuple[str, str]:
    """Parsea 'FE-2026-00101' → ('FE-2026', '00101'), o 'FE10' → ('FE', '10').

    Reglas:
      - Si hay guiones: prefijo = todo menos el último segmento, folio = último.
      - Si hay letras seguidas de dígitos: separar en el borde.
      - Si es solo dígitos: prefijo = '', folio = número.
    """
    if not numero:
        return "", ""
    s = str(numero).strip()

    if "-" in s:
        partes = s.split("-")
        return "-".join(partes[:-1]), partes[-1]

    m = re.match(r"^([A-Za-z]+)(\d+)$", s)
    if m:
        return m.group(1), m.group(2)

    if s.isdigit():
        return "", s

    return s, ""


@dataclass
class ResultadoConciliacion:
    """Un renglón del reporte de conciliación."""
    estado: str                       # 'coincide' | 'diferencia_valor' | 'solo_en_app' | 'solo_en_dian'
    match_por: Optional[str]          # 'cufe' | 'folio' | None
    diferencia_valor: Optional[float] # None si no aplica; positivo si app > DIAN, negativo si al revés

    # Factura de la app (si existe)
    factura_id: Optional[int]
    factura_numero: Optional[str]
    factura_proveedor_nit: Optional[str]
    factura_proveedor_nombre: Optional[str]
    factura_fecha: Optional[date]
    factura_valor: Optional[float]
    factura_estado: Optional[str]

    # Documento DIAN (si existe)
    documento_dian_id: Optional[int]
    dian_cufe: Optional[str]
    dian_prefijo: Optional[str]
    dian_folio: Optional[str]
    dian_tipo: Optional[str]
    dian_grupo: Optional[str]
    dian_nit_emisor: Optional[str]
    dian_nombre_emisor: Optional[str]
    dian_fecha_emision: Optional[date]
    dian_valor: Optional[float]

    def to_dict(self) -> dict:
        return {
            "estado": self.estado,
            "match_por": self.match_por,
            "diferencia_valor": self.diferencia_valor,
            "factura_id": self.factura_id,
            "factura_numero": self.factura_numero,
            "factura_proveedor_nit": self.factura_proveedor_nit,
            "factura_proveedor_nombre": self.factura_proveedor_nombre,
            "factura_fecha": self.factura_fecha.isoformat() if self.factura_fecha else None,
            "factura_valor": self.factura_valor,
            "factura_estado": self.factura_estado,
            "documento_dian_id": self.documento_dian_id,
            "dian_cufe": self.dian_cufe,
            "dian_prefijo": self.dian_prefijo,
            "dian_folio": self.dian_folio,
            "dian_tipo": self.dian_tipo,
            "dian_grupo": self.dian_grupo,
            "dian_nit_emisor": self.dian_nit_emisor,
            "dian_nombre_emisor": self.dian_nombre_emisor,
            "dian_fecha_emision": self.dian_fecha_emision.isoformat() if self.dian_fecha_emision else None,
            "dian_valor": self.dian_valor,
        }


async def conciliar_facturas_vs_dian(
    db: AsyncSession,
    empresa_id: int,
    empresa_nit: str,
    fecha_desde: Optional[date] = None,
    fecha_hasta: Optional[date] = None,
    solo_compras: bool = True,
) -> list[ResultadoConciliacion]:
    """Genera el reporte completo cruzando facturas de la app vs docs DIAN.

    Args:
      solo_compras: si True (default), solo cruza compras — que es lo que
        el equipo contable procesa en la app. Las ventas (facturas emitidas
        por la empresa) se ven en el módulo aparte. Poner False para ver
        también las ventas emitidas.
    """
    empresa_nit_norm = _normalizar_nit(empresa_nit)

    # --- Cargar facturas de la app ---
    stmt = (
        select(Factura, Proveedor)
        .join(Proveedor, Proveedor.id == Factura.proveedor_id, isouter=True)
        .where(Factura.empresa_id == empresa_id)
    )
    if fecha_desde:
        stmt = stmt.where(Factura.fecha_factura >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(Factura.fecha_factura <= fecha_hasta)

    result = await db.execute(stmt)
    facturas_rows = list(result.all())

    # Indexar facturas app por CUFE y por (nit_emisor+prefijo+folio)
    facturas_por_cufe: dict[str, tuple[Factura, Optional[Proveedor]]] = {}
    facturas_por_folio: dict[tuple[str, str, str], tuple[Factura, Optional[Proveedor]]] = {}

    for f, prov in facturas_rows:
        cufe = (f.cufe or "").strip()
        if cufe:
            facturas_por_cufe[cufe] = (f, prov)

        # Extraer prefijo y folio del `numero_factura`
        pref, fol = _split_numero_factura(f.numero_factura)
        # NIT emisor = el proveedor (para compras). Si es venta, sería el NIT propio.
        nit_emi = _normalizar_nit(prov.nit if prov else "")
        if fol:
            facturas_por_folio[(nit_emi, pref, _normalizar_folio(fol))] = (f, prov)

    # --- Cargar documentos DIAN ---
    stmt = select(DocumentoDian).where(DocumentoDian.empresa_id == empresa_id)
    if fecha_desde:
        stmt = stmt.where(DocumentoDian.fecha_emision >= fecha_desde)
    if fecha_hasta:
        stmt = stmt.where(DocumentoDian.fecha_emision <= fecha_hasta)
    if solo_compras:
        # Compras: nit_emisor != NIT_empresa. Filtramos con la columna grupo
        # cuando existe ('Recibidos'), o por NIT emisor distinto.
        # DIAN a veces normaliza grupo a "Recibidos" y a veces no lo trae —
        # usamos el NIT como criterio principal.
        pass  # el filtro real se hace debajo cuando iteramos

    result = await db.execute(stmt)
    docs_dian = list(result.scalars().all())

    if solo_compras:
        docs_dian = [d for d in docs_dian
                     if _normalizar_nit(d.nit_emisor) != empresa_nit_norm]

    docs_matched_ids: set[int] = set()
    resultados: list[ResultadoConciliacion] = []
    facturas_matched: set[int] = set()

    # --- Match por CUFE / folio ---
    for d in docs_dian:
        cufe = (d.cufe or "").strip()
        match_por: Optional[str] = None
        factura: Optional[Factura] = None
        proveedor: Optional[Proveedor] = None

        if cufe and cufe in facturas_por_cufe:
            factura, proveedor = facturas_por_cufe[cufe]
            match_por = "cufe"
        else:
            nit_emi = _normalizar_nit(d.nit_emisor)
            pref = (d.prefijo or "").strip()
            fol = _normalizar_folio(d.folio)
            key = (nit_emi, pref, fol)
            if key in facturas_por_folio:
                factura, proveedor = facturas_por_folio[key]
                match_por = "folio"

        if factura is not None:
            docs_matched_ids.add(d.id)
            facturas_matched.add(factura.id)

            # Comparar valores (usar valor de la factura y de DIAN)
            valor_app = float(factura.valor or 0)
            valor_dian = float(d.valor or 0)
            diff = valor_app - valor_dian
            estado = ("diferencia_valor"
                      if abs(diff) > TOLERANCIA_VALOR_COP
                      else "coincide")

            resultados.append(ResultadoConciliacion(
                estado=estado,
                match_por=match_por,
                diferencia_valor=diff if estado == "diferencia_valor" else None,
                factura_id=factura.id,
                factura_numero=factura.numero_factura,
                factura_proveedor_nit=(proveedor.nit if proveedor else None),
                factura_proveedor_nombre=(proveedor.nombre if proveedor else None),
                factura_fecha=factura.fecha_factura,
                factura_valor=valor_app,
                factura_estado=factura.estado,
                documento_dian_id=d.id,
                dian_cufe=d.cufe,
                dian_prefijo=d.prefijo,
                dian_folio=d.folio,
                dian_tipo=d.tipo_documento,
                dian_grupo=d.grupo,
                dian_nit_emisor=d.nit_emisor,
                dian_nombre_emisor=d.nombre_emisor,
                dian_fecha_emision=d.fecha_emision,
                dian_valor=valor_dian,
            ))
        else:
            # Documento DIAN sin match en la app — solo en DIAN.
            resultados.append(ResultadoConciliacion(
                estado="solo_en_dian",
                match_por=None,
                diferencia_valor=None,
                factura_id=None,
                factura_numero=None,
                factura_proveedor_nit=None,
                factura_proveedor_nombre=None,
                factura_fecha=None,
                factura_valor=None,
                factura_estado=None,
                documento_dian_id=d.id,
                dian_cufe=d.cufe,
                dian_prefijo=d.prefijo,
                dian_folio=d.folio,
                dian_tipo=d.tipo_documento,
                dian_grupo=d.grupo,
                dian_nit_emisor=d.nit_emisor,
                dian_nombre_emisor=d.nombre_emisor,
                dian_fecha_emision=d.fecha_emision,
                dian_valor=float(d.valor or 0),
            ))

    # --- Facturas app sin match — solo en app ---
    for f, prov in facturas_rows:
        if f.id in facturas_matched:
            continue
        resultados.append(ResultadoConciliacion(
            estado="solo_en_app",
            match_por=None,
            diferencia_valor=None,
            factura_id=f.id,
            factura_numero=f.numero_factura,
            factura_proveedor_nit=(prov.nit if prov else None),
            factura_proveedor_nombre=(prov.nombre if prov else None),
            factura_fecha=f.fecha_factura,
            factura_valor=float(f.valor or 0),
            factura_estado=f.estado,
            documento_dian_id=None,
            dian_cufe=None,
            dian_prefijo=None,
            dian_folio=None,
            dian_tipo=None,
            dian_grupo=None,
            dian_nit_emisor=None,
            dian_nombre_emisor=None,
            dian_fecha_emision=None,
            dian_valor=None,
        ))

    # Ordenar: primero problemas (solo_en_dian, solo_en_app, diferencia_valor)
    # y al final coincide.
    orden = {"solo_en_dian": 0, "diferencia_valor": 1, "solo_en_app": 2, "coincide": 3}
    resultados.sort(key=lambda r: (
        orden.get(r.estado, 9),
        r.dian_fecha_emision or r.factura_fecha or date(1970, 1, 1),
    ), reverse=False)

    return resultados


def resumen_conciliacion(resultados: list[ResultadoConciliacion]) -> dict:
    """KPIs para el header del reporte en la UI."""
    cuenta = {"coincide": 0, "diferencia_valor": 0, "solo_en_app": 0, "solo_en_dian": 0}
    valor_solo_dian = 0.0
    valor_solo_app = 0.0
    diff_total = 0.0

    for r in resultados:
        cuenta[r.estado] = cuenta.get(r.estado, 0) + 1
        if r.estado == "solo_en_dian":
            valor_solo_dian += r.dian_valor or 0
        elif r.estado == "solo_en_app":
            valor_solo_app += r.factura_valor or 0
        elif r.estado == "diferencia_valor" and r.diferencia_valor is not None:
            diff_total += abs(r.diferencia_valor)

    total = sum(cuenta.values())
    return {
        "total": total,
        "coincidencias": cuenta["coincide"],
        "diferencias_valor": cuenta["diferencia_valor"],
        "solo_en_app": cuenta["solo_en_app"],
        "solo_en_dian": cuenta["solo_en_dian"],
        "valor_pendiente_registrar": valor_solo_dian,      # $ que están en DIAN pero no en la app
        "valor_sin_soporte_dian": valor_solo_app,           # $ en la app sin factura electrónica DIAN
        "suma_discrepancias": diff_total,                   # $ absoluto de discrepancias en las que sí matchearon
    }
