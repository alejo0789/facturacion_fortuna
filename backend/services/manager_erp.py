"""
Exportador de Notas Bancarias (NB01) compatible con ManagerERP.

ManagerERP (sistema contable colombiano usado por La Fortuna) recibe los
documentos contables vía archivo plano CSV con estructura tipo:

    DOC_TIPO;DOC_NUMERO;FECHA;CUENTA_PUC;NIT;CENTRO_COSTO;DESCRIPCION;DEBITO;CREDITO;BASE

Cada línea representa un débito o crédito. La cabecera del documento se
infiere del primer renglón (DOC_TIPO, DOC_NUMERO, FECHA).

La NB01 es el documento de "Nota Bancaria" — registra el pago de varias
facturas a través de banco. La causación previa de cada factura debe estar
contabilizada antes.

Este módulo expone:
  - exportar_nb_csv(nb_numero, fecha, items)
        donde `items` es lista de dicts con factura, proveedor_nit, valor,
        cuenta_proveedor, cuenta_banco, etc.
  - exportar_asiento_csv(asiento)
        toma un AsientoContable + sus LineaAsiento y los aplana a CSV plano.
"""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal
from typing import Iterable

from models_contabilidad import AsientoContable, LineaAsiento


# Mapeo tipo asiento → DOC_TIPO ManagerERP
TIPO_DOC_MANAGER = {
    "CAUSACION": "FC",                # Factura compra
    "VENTA": "FV",                    # Factura venta
    "PAGO": "NB",                     # Nota bancaria (pago)
    "NOTA_CREDITO_VENTA": "NCV",
    "NOTA_CREDITO_COMPRA": "NCC",
    "AJUSTE": "AJ",
    "APERTURA": "AP",
    "CIERRE": "CI",
    "MANUAL": "MN",
}


def _csv_header() -> list[str]:
    return [
        "DOC_TIPO",
        "DOC_NUMERO",
        "FECHA",
        "CUENTA_PUC",
        "NIT",
        "CENTRO_COSTO",
        "DESCRIPCION",
        "DEBITO",
        "CREDITO",
        "BASE_IMPUESTO",
        "CONCEPTO_DIAN",
    ]


def _csv_row(
    *,
    doc_tipo: str,
    doc_numero: str,
    fecha: date,
    cuenta_puc: str,
    nit: str | None,
    centro_costo: str | None,
    descripcion: str | None,
    debito: Decimal,
    credito: Decimal,
    base: Decimal | None,
    concepto_dian: str | None,
) -> list:
    return [
        doc_tipo,
        doc_numero,
        fecha.strftime("%Y-%m-%d"),
        cuenta_puc,
        nit or "",
        centro_costo or "",
        (descripcion or "").replace("\n", " ").replace(";", ","),
        f"{debito:.2f}" if debito else "0.00",
        f"{credito:.2f}" if credito else "0.00",
        f"{base:.2f}" if base else "",
        concepto_dian or "",
    ]


def exportar_asiento_csv(asiento: AsientoContable) -> bytes:
    """
    Aplana un asiento (cabecera + líneas) a CSV ManagerERP.
    """
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(_csv_header())

    doc_tipo = TIPO_DOC_MANAGER.get(asiento.tipo, "MN")
    doc_numero = f"{doc_tipo}-{asiento.numero:06d}"

    for linea in asiento.lineas:
        w.writerow(_csv_row(
            doc_tipo=doc_tipo,
            doc_numero=doc_numero,
            fecha=asiento.fecha,
            cuenta_puc=linea.cuenta_codigo,
            nit=linea.nit_tercero,
            centro_costo=linea.centro_costo,
            descripcion=linea.detalle or asiento.descripcion,
            debito=Decimal(linea.debito or 0),
            credito=Decimal(linea.credito or 0),
            base=Decimal(linea.base_impuesto) if linea.base_impuesto else None,
            concepto_dian=linea.concepto_dian,
        ))
    return buf.getvalue().encode("utf-8-sig")


def exportar_lote_asientos_csv(asientos: Iterable[AsientoContable]) -> bytes:
    """
    Aplana N asientos a un único CSV (la cabecera se imprime una sola vez).
    Útil para enviar el batch mensual a ManagerERP.
    """
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(_csv_header())

    for asiento in asientos:
        doc_tipo = TIPO_DOC_MANAGER.get(asiento.tipo, "MN")
        doc_numero = f"{doc_tipo}-{asiento.numero:06d}"
        for linea in asiento.lineas:
            w.writerow(_csv_row(
                doc_tipo=doc_tipo,
                doc_numero=doc_numero,
                fecha=asiento.fecha,
                cuenta_puc=linea.cuenta_codigo,
                nit=linea.nit_tercero,
                centro_costo=linea.centro_costo,
                descripcion=linea.detalle or asiento.descripcion,
                debito=Decimal(linea.debito or 0),
                credito=Decimal(linea.credito or 0),
                base=Decimal(linea.base_impuesto) if linea.base_impuesto else None,
                concepto_dian=linea.concepto_dian,
            ))
    return buf.getvalue().encode("utf-8-sig")
