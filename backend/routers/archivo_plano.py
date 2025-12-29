"""
Archivo Plano Router - Generate flat file Excel for Manager accounting system
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import date, datetime
import io
import os
import httpx
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, Alignment

router = APIRouter()

# Path to template file
TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), '..', 'Template_archivo_plano', 'template_plano.xlsx')

# --- Schemas ---

class OficinaArchivoPlano(BaseModel):
    """Office with value for flat file generation"""
    cod_oficina: str
    valor: Decimal
    nombre_oficina: Optional[str] = None


class FacturaArchivoPlano(BaseModel):
    """Invoice with its offices for flat file generation"""
    numero_factura: Optional[str] = None
    fecha_factura: Optional[date] = None  # For extracting month
    oficinas: List[OficinaArchivoPlano]


class ArchivoPlanoRequest(BaseModel):
    """Request to generate flat file Excel"""
    proveedor_nit: str
    proveedor_nombre: Optional[str] = None
    fecha_causacion: Optional[date] = None  # Defaults to today
    tiene_iva: bool = True  # If supplier has IVA
    porcentaje_retefuente: float = 0  # 0 = no retefuente, 4 = 4%, 6 = 6%
    facturas: List[FacturaArchivoPlano]  # List of invoices with their offices
    numedoc: int = 1290  # Variable for future updates


# --- Helper Functions ---

def extract_codigo_for_oracle(cod_oficina: str) -> str:
    """
    Extract digits to search Oracle based on cod_oficina length:
    - 7 digits -> first 4
    - 6 digits -> first 3
    - 5 digits -> first 2
    - 4 digits -> first 1
    """
    cod = cod_oficina.strip()
    length = len(cod)
    
    if length >= 7:
        return cod[:4]
    elif length == 6:
        return cod[:3]
    elif length == 5:
        return cod[:2]
    elif length == 4:
        return cod[:1]
    else:
        return cod


async def get_centro_costo(cod_oficina: str) -> str:
    """
    Call Oracle API to get centro de costo for an office.
    Returns the codigo_ccosto or empty string if not found.
    """
    codigo_busqueda = extract_codigo_for_oracle(cod_oficina)
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"http://localhost:8000/api/oficinas-oracle/{codigo_busqueda}",
                timeout=10.0
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get("success") and data.get("data"):
                    return data["data"].get("codigo_ccosto", "").strip()
    except Exception as e:
        print(f"Error getting centro costo for {cod_oficina}: {e}")
    
    return ""


def format_date_for_excel(d: date) -> str:
    """Format date as YYYY/MM/DD for Excel (template has text format)"""
    return d.strftime('%Y/%m/%d')


def format_value(value: str) -> str:
    """Return value as-is (template already has text format configured)"""
    return value


def get_month_name_spanish(d: date) -> str:
    """Get Spanish month name from date"""
    months = {
        1: "ENERO", 2: "FEBRERO", 3: "MARZO", 4: "ABRIL",
        5: "MAYO", 6: "JUNIO", 7: "JULIO", 8: "AGOSTO",
        9: "SEPTIEMBRE", 10: "OCTUBRE", 11: "NOVIEMBRE", 12: "DICIEMBRE"
    }
    return months.get(d.month, "")


def create_flat_file_row(
    row_index: int,  # Excel row number (2, 3, 4...) for formulas
    empresa: str = "101",  # Must be text, not number
    clase: str = "0000 ",
    vinkey: str = ".",
    tipodoc: str = "DC07",  # Template handles text format
    numedoc: int = 1290,
    reg: int = 0,  # Changed to 0
    fecha: str = "",
    cuenta: str = "",
    vinculado: str = "",
    sucvin: str = ".",
    sucurs: str = ".",
    ccosto: str = "",
    destino: str = "",
    vende: str = ".",
    cobra: str = ".",
    zona: str = ".",
    bodega: str = ".",
    producto: str = ".",
    unimed: str = ".",
    lotepro: str = ".",
    cantidad: int = 0,  # Changed to 0
    claseinv: str = ".",
    clacru1: str = "0000 ",
    tipcru1: str = None,  # Will be formula =D{row}
    numcru1: str = None,   # Will be formula =E{row}
    cuocru1: int = 0,     # Changed to 0
    fecini: str = None,    # Will be formula =G{row}
    plazo: int = 0,       # Changed to 0
    clacru2: str = ".",
    tipcru2: str = ".",
    numcru2: int = 0,     # Changed to 0
    cuocru2: int = 0,     # Changed to 0
    valdebi: float = 0,   # Always 0, not empty
    valcred: float = 0,   # Always 0, not empty
    parci_o: int = 0,     # Changed to 0
    tpreg: int = 1,       # Must be number, not text
    detalle: str = "",
    serial: str = ".",
    formapago: str = ".",
    dv_referencia: str = ".",
    dv_motivo: str = ".",
    docrespald: str = None,  # Will be formula =E{row}
    docplazo: int = 0        # Changed to 0
) -> list:
    """Create a single row for the flat file with Excel formulas"""
    return [
        empresa,                       # EMPRESA.C3
        clase,                         # CLASE.C4
        vinkey,                        # VINKEY.C15
        tipodoc,                       # TIPODOC.C4 (with apostrophe)
        numedoc,                       # NUMEDOC.N12
        reg,                           # REG.N12 = 0
        fecha,                         # FECHA.C10
        cuenta,                        # CUENTA.C14
        vinculado,                     # VINCULADO.C15
        sucvin,                        # SUCVIN.C3
        sucurs,                        # SUCURS.C5
        ccosto,                        # CCOSTO.C10
        destino,                       # DESTINO.C10
        vende,                         # VENDE.C5
        cobra,                         # COBRA.C5
        zona,                          # ZONA.C5
        bodega,                        # BODEGA.C5
        producto,                      # PRODUCTO.C15
        unimed,                        # UNIMED.C4
        lotepro,                       # LOTEPRO.C12
        cantidad,                      # CANTIDAD.N20 = 0
        claseinv,                      # CLASEINV.C1
        clacru1,                       # CLACRU1.C4
        tipcru1 if tipcru1 else f"=D{row_index}",  # TIPCRU1.C4 = formula
        numcru1 if numcru1 else f"=E{row_index}",  # NUMCRU1.N12 = formula
        cuocru1,                       # CUOCRU1.N12 = 0
        fecini if fecini else f"=G{row_index}",   # FECINI.C10 = formula
        plazo,                         # PLAZO.N10 = 0
        clacru2,                       # CLACRU2.C4
        tipcru2,                       # TIPCRU2.C4
        numcru2,                       # NUMCRU2.N12 = 0
        cuocru2,                       # CUOCRU2.N12 = 0
        valdebi,                       # VALDEBI.N20 (always number, 0 if no value)
        valcred,                       # VALCRED.N20 (always number, 0 if no value)
        parci_o,                       # PARCI_O.N20 = 0
        tpreg,                         # TPREG.N1
        detalle,                       # DETALLE.C250
        serial,                        # SERIAL.C50
        formapago,                     # FORMAPAGO.C10
        dv_referencia,                 # DV_REFERENCIA.C80
        dv_motivo,                     # DV_MOTIVO.C6
        docrespald if docrespald else f"=E{row_index}",  # DOCRESPALD.N15 = formula
        docplazo                       # DOCPLAZO.N15 = 0
    ]


async def generate_rows_for_oficina(
    oficina: OficinaArchivoPlano,
    proveedor_nit: str,
    fecha: str,
    numedoc: int,
    tiene_iva: bool,
    numero_factura: str,  # For building DETALLE
    fecha_factura: Optional[date],  # For extracting month
    starting_row_index: int  # Excel row number to start (2, 3, 4...)
) -> tuple[List[list], int, dict]:
    """
    Generate debit rows (70%/30%) for a single office.
    
    The 70%/30% is calculated on (valor / 1.19) if tiene_iva.
    
    Returns:
        tuple: (list of rows, next_row_index, office_info for final rows)
    """
    rows = []
    current_row = starting_row_index
    
    # Get centro de costo from Oracle
    ccosto_raw = await get_centro_costo(oficina.cod_oficina)
    ccosto = format_value(ccosto_raw) if ccosto_raw else ""
    
    # Format values
    vinculado = format_value(proveedor_nit)
    destino = format_value(oficina.cod_oficina)
    
    # Build DETALLE: FACT {num} SERVICIO DE INTERNET {oficina} MES {mes}
    nombre_oficina = oficina.nombre_oficina or oficina.cod_oficina
    mes_factura = get_month_name_spanish(fecha_factura) if fecha_factura else ""
    detalle = f"FACT {numero_factura} SERVICIO DE INTERNET {nombre_oficina} MES {mes_factura}"
    
    valor = float(oficina.valor)
    
    # Calculate base value (without IVA if applicable)
    # If tiene_iva: valor includes IVA, so base = valor / 1.19
    if tiene_iva:
        valor_base = round(valor / 1.19, 0)
        valor_iva = round(valor - valor_base, 0)
    else:
        valor_base = valor
        valor_iva = 0
    
    # Split base value 70%/30%
    valor_70 = round(valor_base * 0.70, 0)
    valor_30 = round(valor_base * 0.30, 0)
    
    # Row 1: Account 61350513 - 70% (VALDEBI)
    rows.append(create_flat_file_row(
        row_index=current_row,
        numedoc=numedoc,
        fecha=fecha,
        cuenta=format_value("61350513"),
        vinculado=vinculado,
        ccosto=ccosto,
        destino=destino,
        valdebi=valor_70,
        detalle=detalle
    ))
    current_row += 1
    
    # Row 2: Account 61700360 - 30% (VALDEBI)
    rows.append(create_flat_file_row(
        row_index=current_row,
        numedoc=numedoc,
        fecha=fecha,
        cuenta=format_value("61700360"),
        vinculado=vinculado,
        ccosto=ccosto,
        destino=destino,
        valdebi=valor_30,
        detalle=detalle
    ))
    current_row += 1
    
    # Return office info for final rows
    office_info = {
        "ccosto": ccosto,
        "destino": destino,
        "vinculado": vinculado,
        "valor": valor,
        "valor_base": valor_base,
        "valor_iva": valor_iva,
        "valor_70": valor_70,
        "valor_30": valor_30,
        "detalle": detalle  # For summary rows
    }
    
    return rows, current_row, office_info


def create_final_summary_rows(
    total_debitos: float,  # Sum of all 70% + 30% across all offices
    total_iva: float,      # Total IVA across all offices
    tiene_iva: bool,
    porcentaje_retefuente: float,  # 0, 4, or 6
    total_valor: float,    # Sum of all office valores
    last_office_info: dict,  # ccosto, destino, vinculado from last office
    numedoc: int,
    fecha: str,
    detalle: str,
    starting_row_index: int
) -> tuple[List[list], int]:
    """
    Generate final summary rows: IVA, Retefuente (if applicable), and Total.
    Uses the last office's ccosto and destino.
    """
    rows = []
    current_row = starting_row_index
    
    ccosto = last_office_info["ccosto"]
    destino = last_office_info["destino"]
    vinculado = last_office_info["vinculado"]
    
    # Calculate retefuente based on percentage (0%, 4%, or 6%)
    valor_retefuente = round(total_valor * (porcentaje_retefuente / 100), 0) if porcentaje_retefuente > 0 else 0
    
    # Calculate balance: total debitos + IVA - retefuente
    valor_balance = total_debitos + total_iva - valor_retefuente
    
    # Row: Account 24081003 - IVA total (VALDEBI) - only if tiene_iva
    if tiene_iva and total_iva > 0:
        rows.append(create_flat_file_row(
            row_index=current_row,
            numedoc=numedoc,
            fecha=fecha,
            cuenta=format_value("24081003"),
            vinculado=vinculado,
            ccosto=ccosto,
            destino=".",  # IVA row uses "." for DESTINO
            valdebi=total_iva,
            detalle=detalle
        ))
        current_row += 1
    
    # Row: Account 23652501 - Retefuente (VALCRED) - only if porcentaje > 0
    if porcentaje_retefuente > 0:
        rows.append(create_flat_file_row(
            row_index=current_row,
            numedoc=numedoc,
            fecha=fecha,
            cuenta=format_value("23652501"),
            vinculado=vinculado,
            ccosto=ccosto,
            destino=destino,
            valcred=valor_retefuente,
            detalle=detalle
        ))
        current_row += 1
    
    # Row: Account 23355002 - Balance total (VALCRED)
    rows.append(create_flat_file_row(
        row_index=current_row,
        numedoc=numedoc,
        fecha=fecha,
        cuenta=format_value("23355002"),
        vinculado=vinculado,
        ccosto=ccosto,
        destino=destino,
        valcred=valor_balance,
        detalle=detalle
    ))
    current_row += 1
    
    return rows, current_row


# --- Constants: Column Headers ---
HEADERS = [
    "EMPRESA.C3", "CLASE.C4", "VINKEY.C15", "TIPODOC.C4", "NUMEDOC.N12",
    "REG.N12", "FECHA.C10", "CUENTA.C14", "VINCULADO.C15", "SUCVIN.C3",
    "SUCURS.C5", "CCOSTO.C10", "DESTINO.C10", "VENDE.C5", "COBRA.C5",
    "ZONA.C5", "BODEGA.C5", "PRODUCTO.C15", "UNIMED.C4", "LOTEPRO.C12",
    "CANTIDAD.N20", "CLASEINV.C1", "CLACRU1.C4", "TIPCRU1.C4", "NUMCRU1.N12",
    "CUOCRU1.N12", "FECINI.C10", "PLAZO.N10", "CLACRU2.C4", "TIPCRU2.C4",
    "NUMCRU2.N12", "CUOCRU2.N12", "VALDEBI.N20", "VALCRED.N20", "PARCI_O.N20",
    "TPREG.N1", "DETALLE.C250", "SERIAL.C50", "FORMAPAGO.C10",
    "DV_REFERENCIA.C80", "DV_MOTIVO.C6", "DOCRESPALD.N15", "DOCPLAZO.N15"
]


# --- Endpoint ---

@router.post("/archivo-plano/generar")
async def generar_archivo_plano(request: ArchivoPlanoRequest):
    """
    Generate flat file Excel for Manager accounting system.
    
    For each office, generates rows for:
    - Account 61350513: 70% of value (debit)
    - Account 61700360: 30% of value (debit)
    - Account 24081003: IVA 19% (debit) - if tiene_iva
    - Account 23652501: Retefuente (credit) - if porcentaje_retefuente > 0
    - Account 23355002: Balance total (credit)
    """
    if not request.facturas:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos una factura")
    
    # Use today's date if not provided
    fecha_causacion = request.fecha_causacion or date.today()
    fecha_str = format_date_for_excel(fecha_causacion)
    
    # Generate all rows
    all_rows = []
    current_row_index = 2  # Excel rows start at 2 (row 1 is headers)
    
    # Process each factura separately with incrementing NUMEDOC
    for factura_index, factura in enumerate(request.facturas):
        if not factura.oficinas:
            continue
        
        # NUMEDOC increments per factura: first factura uses base, next uses base+1, etc.
        factura_numedoc = request.numedoc + factura_index
        
        # Accumulators for this factura
        factura_debitos = 0  # Sum of 70% + 30%
        factura_iva = 0
        factura_valor = 0
        last_office_info = None
        last_detalle = ""  # Store the last detalle for summary rows
        
        # Generate rows for each office in this factura
        for oficina in factura.oficinas:
            rows, current_row_index, office_info = await generate_rows_for_oficina(
                oficina=oficina,
                proveedor_nit=request.proveedor_nit,
                fecha=fecha_str,
                numedoc=factura_numedoc,
                tiene_iva=request.tiene_iva,
                numero_factura=factura.numero_factura or '',
                fecha_factura=factura.fecha_factura,
                starting_row_index=current_row_index
            )
            all_rows.extend(rows)
            
            # Accumulate totals for this factura
            factura_debitos += office_info["valor_70"] + office_info["valor_30"]
            factura_iva += office_info["valor_iva"]
            factura_valor += office_info["valor"]
            last_office_info = office_info
            last_detalle = office_info.get("detalle", "")
        
        # Generate IVA and Total rows for THIS factura
        if last_office_info:
            summary_rows, current_row_index = create_final_summary_rows(
                total_debitos=factura_debitos,
                total_iva=factura_iva,
                tiene_iva=request.tiene_iva,
                porcentaje_retefuente=request.porcentaje_retefuente,
                total_valor=factura_valor,
                last_office_info=last_office_info,
                numedoc=factura_numedoc,
                fecha=fecha_str,
                detalle=last_detalle,
                starting_row_index=current_row_index
            )
            all_rows.extend(summary_rows)
    
    # Load Excel template (preserves all cell formats)
    try:
        wb = load_workbook(TEMPLATE_PATH)
        ws = wb.active
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Template file not found")
    
    # Write data rows (row 1 is headers in template, data starts at row 2)
    for row_idx, row_data in enumerate(all_rows, 2):
        for col_idx, value in enumerate(row_data, 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.value = value
    
    # Clear excess rows (rows after our data that have old template data)
    last_data_row = len(all_rows) + 1  # +1 because data starts at row 2
    for row_idx in range(last_data_row + 1, ws.max_row + 1):
        for col_idx in range(1, 44):  # 43 columns
            ws.cell(row=row_idx, column=col_idx).value = None
    
    # Save to buffer
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    
    # Generate filename
    filename = f"archivo_plano_{request.proveedor_nit}_{fecha_causacion.strftime('%Y%m%d')}.xlsx"
    
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.post("/archivo-plano/preview")
async def preview_archivo_plano(request: ArchivoPlanoRequest):
    """
    Preview the flat file data without generating Excel.
    Returns JSON with all rows that would be generated.
    """
    if not request.facturas:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos una factura")
    
    fecha_causacion = request.fecha_causacion or date.today()
    fecha_str = format_date_for_excel(fecha_causacion)
    
    all_rows = []
    current_row_index = 2  # Excel rows start at 2 (row 1 is headers)
    
    # Process each factura separately with incrementing NUMEDOC
    for factura_index, factura in enumerate(request.facturas):
        if not factura.oficinas:
            continue
        
        # NUMEDOC increments per factura
        factura_numedoc = request.numedoc + factura_index
        
        # Accumulators for this factura
        factura_debitos = 0
        factura_iva = 0
        factura_valor = 0
        last_office_info = None
        last_detalle = ""
        
        for oficina in factura.oficinas:
            rows, current_row_index, office_info = await generate_rows_for_oficina(
                oficina=oficina,
                proveedor_nit=request.proveedor_nit,
                fecha=fecha_str,
                numedoc=factura_numedoc,
                tiene_iva=request.tiene_iva,
                numero_factura=factura.numero_factura or '',
                fecha_factura=factura.fecha_factura,
                starting_row_index=current_row_index
            )
            all_rows.extend(rows)
            
            factura_debitos += office_info["valor_70"] + office_info["valor_30"]
            factura_iva += office_info["valor_iva"]
            factura_valor += office_info["valor"]
            last_office_info = office_info
            last_detalle = office_info.get("detalle", "")
        
        # Generate IVA and Total rows for THIS factura
        if last_office_info:
            summary_rows, current_row_index = create_final_summary_rows(
                total_debitos=factura_debitos,
                total_iva=factura_iva,
                tiene_iva=request.tiene_iva,
                porcentaje_retefuente=request.porcentaje_retefuente,
                total_valor=factura_valor,
                last_office_info=last_office_info,
                numedoc=factura_numedoc,
                fecha=fecha_str,
                detalle=last_detalle,
                starting_row_index=current_row_index
            )
            all_rows.extend(summary_rows)
    
    # Convert rows to dict for better readability
    rows_as_dicts = []
    for row in all_rows:
        row_dict = {HEADERS[i]: row[i] for i in range(len(HEADERS))}
        rows_as_dicts.append(row_dict)
    
    return {
        "success": True,
        "total_rows": len(all_rows),
        "headers": HEADERS,
        "rows": rows_as_dicts
    }
