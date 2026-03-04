"""
Pagos Router - Module for managing payments and generating consolidado reports.

Strategy for Excel generation:
  - Write data ONLY to the 'info' sheet (row 2+).
  - The 'consolidado' sheet already has formulas like =info!A2, =info!B2...
    so logos, formatting, and column widths are never touched.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
import openpyxl
from io import BytesIO
import threading
from datetime import datetime, date
import os
import re
from urllib.parse import quote

from database import get_db
import models

router = APIRouter()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MESES_ES = {
    1: 'ENERO', 2: 'FEBRERO', 3: 'MARZO', 4: 'ABRIL', 5: 'MAYO', 6: 'JUNIO',
    7: 'JULIO', 8: 'AGOSTO', 9: 'SEPTIEMBRE', 10: 'OCTUBRE', 11: 'NOVIEMBRE', 12: 'DICIEMBRE'
}

TEMPLATE_PATH = os.path.join(
    os.path.dirname(__file__), '..', 'Template_consolidado',
    'PROGRAMACION FEBRERO 12 2025.xlsx'
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ConsolidadoPagosRequest(BaseModel):
    factura_ids: List[int]
    semana_pago: Optional[str] = None   # e.g. "12 DE FEBRERO DE 2025"
    tipo_pago: Optional[str] = "CONSIGNACIÓN"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def extract_doc_contable(obs: str) -> str:
    """Extract documento contable code (e.g. DC07-1666) from observaciones text."""
    if not obs:
        return ""
    m = re.search(r'DC\w*-[\d]+([-\d]*)', obs, re.IGNORECASE)
    return m.group(0) if m else ""


# ---------------------------------------------------------------------------
# Endpoint: list facturas EN_TRAMITE
# ---------------------------------------------------------------------------

@router.get("/pagos/facturas-en-tramite")
async def get_facturas_en_tramite(
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
):
    """
    Return all facturas with estado='EN_TRAMITE' — those sent to Manager for
    payment. Returns enriched data needed for the payments view.
    """
    stmt = (
        select(models.Factura)
        .options(
            selectinload(models.Factura.proveedor),
            selectinload(models.Factura.oficinas_asignadas)
            .selectinload(models.FacturaOficina.oficina),
            selectinload(models.Factura.oficinas_asignadas)
            .selectinload(models.FacturaOficina.contrato),
        )
        .where(models.Factura.estado == 'EN_TRAMITE')
        .order_by(models.Factura.status_updated_at.desc())
    )

    if fecha_desde:
        try:
            d = date.fromisoformat(fecha_desde)
            stmt = stmt.where(
                models.Factura.status_updated_at >= datetime.combine(d, datetime.min.time())
            )
        except ValueError:
            pass

    if fecha_hasta:
        try:
            d = date.fromisoformat(fecha_hasta)
            stmt = stmt.where(
                models.Factura.status_updated_at <= datetime.combine(d, datetime.max.time())
            )
        except ValueError:
            pass

    result = await db.execute(stmt)
    facturas = result.scalars().all()

    rows = []
    for f in facturas:
        proveedor_nombre = f.proveedor.nombre if f.proveedor else ''
        proveedor_nit = f.proveedor.nit if f.proveedor else ''

        oficinas_info = []
        for oa in (f.oficinas_asignadas or []):
            oficinas_info.append({
                "oficina_id": oa.oficina_id,
                "oficina_nombre": oa.oficina.nombre if oa.oficina else '',
                "oficina_cod": oa.oficina.cod_oficina if oa.oficina else '',
                "valor": float(oa.valor) if oa.valor else 0,
                "num_contrato": oa.contrato.num_contrato if oa.contrato else None,
                "estado": oa.estado,
                "observaciones": oa.observaciones,
            })

        rows.append({
            "id": f.id,
            "numero_factura": f.numero_factura,
            "fecha_factura": str(f.fecha_factura) if f.fecha_factura else None,
            "fecha_vencimiento": str(f.fecha_vencimiento) if f.fecha_vencimiento else None,
            "valor": float(f.valor) if f.valor else 0,
            "estado": f.estado,
            "status_updated_at": f.status_updated_at.isoformat() if f.status_updated_at else None,
            "observaciones": f.observaciones,
            "url_factura": f.url_factura,
            "proveedor_id": f.proveedor_id,
            "proveedor_nombre": proveedor_nombre,
            "proveedor_nit": proveedor_nit,
            "oficinas": oficinas_info,
            "documento_contable": extract_doc_contable(f.observaciones or ""),
            "cuenta_por_pagar": 23355002,
        })

    # Text search (applied after building rows to search nested fields too)
    if search:
        term = search.lower()
        rows = [
            r for r in rows
            if term in (r.get("numero_factura") or "").lower()
            or term in (r.get("proveedor_nombre") or "").lower()
            or term in (r.get("proveedor_nit") or "").lower()
            or term in (r.get("observaciones") or "").lower()
            or any(term in (o.get("oficina_nombre") or "").lower() for o in r["oficinas"])
        ]

    return rows


# ---------------------------------------------------------------------------
# Endpoint: generate Programación de Pagos Excel
# ---------------------------------------------------------------------------

@router.post("/pagos/consolidado-programacion")
async def generar_consolidado_programacion(
    request: ConsolidadoPagosRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate the 'Programación de Pagos' Excel for the selected facturas.

    KEY: writes data ONLY to the 'info' sheet (rows 2+).
    The 'consolidado' sheet pulls data via formulas (=info!A2, =info!B2, ...)
    so logos, column widths, and all formatting remain intact.

    info sheet layout (row 1 = headers already present in template):
      A: ITEM
      B: VALOR NETO A PAGAR
      C: No. FACTURA Y/O CUENTA DE COBRO
      D: CUENTA POR PAGAR  (always 23355002)
      E: CC/NIT
      F: BENEFICIARIO
      G: BANCO             (left blank — user fills)
      H: TIPO DE CUENTA    (left blank — user fills)
      I: CUENTA            (left blank — user fills)
      J: OBSERVACIÓN
      K: DOCUMENTO CONTABLE
    """
    if not request.factura_ids:
        raise HTTPException(status_code=400, detail="No se seleccionaron facturas")

    # Fetch facturas
    stmt = (
        select(models.Factura)
        .options(
            selectinload(models.Factura.proveedor),
            selectinload(models.Factura.oficinas_asignadas)
            .selectinload(models.FacturaOficina.oficina),
            selectinload(models.Factura.oficinas_asignadas)
            .selectinload(models.FacturaOficina.contrato),
        )
        .where(models.Factura.id.in_(request.factura_ids))
        .order_by(models.Factura.id)
    )
    result = await db.execute(stmt)
    facturas = result.scalars().all()

    if not facturas:
        raise HTTPException(status_code=404, detail="No se encontraron las facturas seleccionadas")

    # Load the template — keep everything as-is
    try:
        wb = openpyxl.load_workbook(TEMPLATE_PATH)
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"Template no encontrado: {TEMPLATE_PATH}"
        )

    if 'info' not in wb.sheetnames:
        raise HTTPException(
            status_code=500,
            detail="El template no contiene la hoja 'info'. Verifica el archivo."
        )

    ws_info = wb['info']

    # --- Configurar conexión a Oracle para traer el detalle exacto de Manager ---
    import sys
    sys.path.append('..')
    from oracle_database import get_oracle_connection
    
    oracle_conn = None
    oracle_cursor = None
    try:
        oracle_conn = get_oracle_connection()
        oracle_cursor = oracle_conn.cursor()
    except Exception as e:
        print(f"⚠ Warning: No se pudo conectar a Oracle para leer los detalles desde Manager: {e}")

    # ── Clear old data rows in 'info' (row 1 = headers, keep untouched) ──
    for row_idx in range(2, ws_info.max_row + 1):
        for col_idx in range(1, 12):      # columns A–K
            ws_info.cell(row=row_idx, column=col_idx).value = None

    # ── Write data rows: info row 2 = item 1, info row 3 = item 2, … ──
    for item_num, factura in enumerate(facturas, start=1):
        info_row = item_num + 1   # data starts at row 2 of info sheet

        proveedor_nit    = (factura.proveedor.nit    or "").strip() if factura.proveedor else ""
        proveedor_nombre = (factura.proveedor.nombre or "").strip() if factura.proveedor else ""
        numero_factura   = factura.numero_factura or ""
        valor            = float(factura.valor) if factura.valor else 0
        observaciones    = factura.observaciones or ""
        doc_contable     = extract_doc_contable(observaciones)

        # Buscar el detalle exacto en Manager si tenemos documento contable
        observacion_excel = observaciones
        if doc_contable and oracle_cursor:
            match = re.search(r'([A-Za-z0-9]+)-(\d+)', doc_contable)
            if match:
                tipo_doc = match.group(1).upper()
                try:
                    num_doc = int(match.group(2))
                    oracle_cursor.execute(
                        "SELECT DOCDETALLE FROM MANAGER.MNGDOC WHERE DOCTIPO = :tipo AND DOCNUMERO = :numero",
                        {'tipo': tipo_doc, 'numero': num_doc}
                    )
                    mngdoc_row = oracle_cursor.fetchone()
                    if mngdoc_row and mngdoc_row[0]:
                        observacion_excel = str(mngdoc_row[0]).strip()
                except Exception as e:
                    print(f"Error consultando detalle en Manager para {doc_contable}: {e}")

        ws_info.cell(row=info_row, column=1).value  = item_num          # A: ITEM
        ws_info.cell(row=info_row, column=2).value  = valor             # B: VALOR NETO A PAGAR
        ws_info.cell(row=info_row, column=3).value  = numero_factura    # C: No. FACTURA
        ws_info.cell(row=info_row, column=4).value  = 23355002          # D: CUENTA POR PAGAR
        ws_info.cell(row=info_row, column=5).value  = proveedor_nit     # E: CC/NIT
        ws_info.cell(row=info_row, column=6).value  = proveedor_nombre  # F: BENEFICIARIO
        # G (col 7) BANCO          → blank, user fills
        # H (col 8) TIPO DE CUENTA → blank, user fills
        # I (col 9) CUENTA         → blank, user fills
        ws_info.cell(row=info_row, column=10).value = observacion_excel  # J: OBSERVACIÓN (DE MANAGER)
        ws_info.cell(row=info_row, column=11).value = doc_contable       # K: DOCUMENTO CONTABLE

    # ── Update header text in 'consolidado' (safe: only text cells, no images) ──
    if 'consolidado' in wb.sheetnames:
        ws_cons = wb['consolidado']
        now = datetime.now()
        semana_pago = request.semana_pago or f"{now.day} DE {MESES_ES[now.month]} DE {now.year}"
        ws_cons['C5'] = f"PROGRAMACIÓN DE PAGOS: DE {semana_pago}"
        if request.tipo_pago:
            ws_cons['G5'] = request.tipo_pago

    # ── Generate filename and return ──
    now = datetime.now()
    dia = str(now.day).zfill(2)
    mes = MESES_ES[now.month]
    anio = now.year
    filename = f"PROGRAMACION-PAGOS-{dia}-{mes}-{anio}.xlsx"

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    encoded_filename = quote(filename)
    
    # Cerrar conexion de oracle si se abrio
    if oracle_cursor:
        try: oracle_cursor.close()
        except: pass
    if oracle_conn:
        try: oracle_conn.close()
        except: pass

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# ---------------------------------------------------------------------------
# Endpoint: Verify Manager Causation (Oracle query)
# ---------------------------------------------------------------------------

@router.get("/pagos/causacion-manager/{documento_contable}")
def get_manager_causation_details(documento_contable: str):
    """
    Fetch the ACTUAL causation records directly from Manager's Oracle DB 
    using the Documento Contable (e.g. 'DC07-1666').
    Select ONLY. NO INSERTS.
    """
    import sys
    sys.path.append('..')
    from oracle_database import get_oracle_connection
    
    # Parse document contable (e.g. DC07-1666 -> tipo='DC07', numero=1666)
    match = re.search(r'([A-Za-z0-9]+)-(\d+)', documento_contable)
    if not match:
        raise HTTPException(
            status_code=400, 
            detail=f"Formato de documento contable inválido: '{documento_contable}'. Esperado ej. DC07-1666"
        )
        
    tipo_doc = match.group(1).upper()
    try:
        numero_doc = int(match.group(2))
    except ValueError:
        raise HTTPException(status_code=400, detail="Número de documento inválido")
        
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        # MNGDOC = header (we can check if it exists)
        # MNGMCN = details (this is what the user wants: Cuenta, Tipo, C.Costo, Destino, Valor, Detalle)
        
        query = """
            SELECT 
                MCNCUENTA, 
                MCNTIPODOC, 
                MCNCCOSTO, 
                MCNDESTINO, 
                MCNVALDEBI, 
                MCNVALCRED, 
                MCNDETALLE
            FROM MANAGER.MNGMCN
            WHERE MCNTIPODOC = :tipo 
              AND MCNNUMEDOC = :numero
            ORDER BY MCNREG
        """
        
        cursor.execute(query, {'tipo': tipo_doc, 'numero': numero_doc})
        rows = cursor.fetchall()
        
        if not rows:
            return {
                "success": False,
                "message": f"No se encontró causación en Manager para {documento_contable}",
                "data": []
            }
            
        # Format the result
        detalles = []
        for r in rows:
            cuenta, tipo, ccosto, destino, debito, credito, detalle = r
            
            # Determine if we show debito or credito as the valor
            valor = debito if debito and float(debito) > 0 else credito
            tipo_movimiento = "DEBITO" if debito and float(debito) > 0 else "CREDITO"
            
            detalles.append({
                "cuenta": str(cuenta),
                "tipo": tipo_movimiento,
                "ccosto": str(ccosto) if ccosto else "",
                "destino": str(destino) if destino else "",
                "valor": float(valor) if valor else 0,
                "detalle": str(detalle) if detalle else ""
            })
            
        return {
            "success": True,
            "message": f"Detalles cargados desde Manager",
            "documento": documento_contable,
            "data": detalles
        }
        
    except Exception as e:
        print(f"Error querying Manager: {e}")
        raise HTTPException(status_code=500, detail=f"Error consultando Manager: {str(e)}")
    finally:
        if cursor:
            try:
                cursor.close()
            except: pass
        if connection:
            try:
                connection.close()
            except: pass

