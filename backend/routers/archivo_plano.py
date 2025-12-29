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
import httpx
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

router = APIRouter()

# --- Schemas ---

class OficinaArchivoPlano(BaseModel):
    """Office with value for flat file generation"""
    cod_oficina: str
    valor: Decimal
    nombre_oficina: Optional[str] = None


class ArchivoPlanoRequest(BaseModel):
    """Request to generate flat file Excel"""
    proveedor_nit: str
    proveedor_nombre: Optional[str] = None
    numero_factura: Optional[str] = None
    fecha_causacion: Optional[date] = None  # Defaults to today
    tiene_iva: bool = True  # If supplier has IVA
    tiene_retefuente: bool = False  # If supplier has retefuente
    oficinas: List[OficinaArchivoPlano]
    numedoc: int = 1290  # Variable for future updates
    descripcion: Optional[str] = None  # For DETALLE column


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


def format_date_with_apostrophe(d: date) -> str:
    """Format date as 'YYYY/MM/DD with leading apostrophe"""
    return f"'{d.strftime('%Y/%m/%d')}"


def format_with_apostrophe(value: str) -> str:
    """Add leading apostrophe to value"""
    return f"'{value}"


def create_flat_file_row(
    row_index: int,  # Excel row number (2, 3, 4...) for formulas
    empresa: str = "101 ",
    clase: str = "0000 ",
    vinkey: str = ".",
    tipodoc: str = "'DC07",  # With apostrophe
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
    tpreg: str = "1",
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
    tiene_retefuente: bool,
    detalle: str,
    starting_row_index: int  # Excel row number to start (2, 3, 4...)
) -> tuple[List[list], int]:
    """
    Generate all rows for a single office.
    
    Returns:
        tuple: (list of rows, next_row_index)
    
    Accounts:
    - '61350513: 70% of value (VALDEBI)
    - '61700360: 30% of value (VALDEBI)
    - '24081003: IVA = 19% of (70% + 30%) if tiene_iva (VALDEBI)
    - '23652501: Retefuente = 4% of total if tiene_retefuente (VALCRED)
    - '23355002: Total balance (VALCRED)
    """
    rows = []
    current_row = starting_row_index
    
    # Get centro de costo from Oracle
    ccosto = await get_centro_costo(oficina.cod_oficina)
    
    # Format values
    vinculado = format_with_apostrophe(proveedor_nit)
    destino = format_with_apostrophe(oficina.cod_oficina)
    
    valor = float(oficina.valor)
    valor_70 = round(valor * 0.70, 0)
    valor_30 = round(valor * 0.30, 0)
    valor_iva = round((valor_70 + valor_30) * 0.19, 0) if tiene_iva else 0
    valor_retefuente = round(valor * 0.04, 0) if tiene_retefuente else 0
    
    # Calculate total for balance (cuenta 23355002)
    total_debitos = valor_70 + valor_30 + valor_iva
    total_creditos = valor_retefuente
    valor_balance = total_debitos - total_creditos
    
    # Row 1: Account 61350513 - 70% (VALDEBI)
    rows.append(create_flat_file_row(
        row_index=current_row,
        numedoc=numedoc,
        fecha=fecha,
        cuenta=format_with_apostrophe("61350513"),
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
        cuenta=format_with_apostrophe("61700360"),
        vinculado=vinculado,
        ccosto=ccosto,
        destino=destino,
        valdebi=valor_30,
        detalle=detalle
    ))
    current_row += 1
    
    # Row 3: Account 24081003 - IVA 19% (VALDEBI) - only if tiene_iva
    if tiene_iva:
        rows.append(create_flat_file_row(
            row_index=current_row,
            numedoc=numedoc,
            fecha=fecha,
            cuenta=format_with_apostrophe("24081003"),
            vinculado=vinculado,
            ccosto=ccosto,
            destino=destino,
            valdebi=valor_iva,
            detalle=detalle
        ))
        current_row += 1
    
    # Row 4: Account 23652501 - Retefuente 4% (VALCRED) - only if tiene_retefuente
    if tiene_retefuente:
        rows.append(create_flat_file_row(
            row_index=current_row,
            numedoc=numedoc,
            fecha=fecha,
            cuenta=format_with_apostrophe("23652501"),
            vinculado=vinculado,
            ccosto=ccosto,
            destino=destino,
            valcred=valor_retefuente,
            detalle=detalle
        ))
        current_row += 1
    
    # Row 5: Account 23355002 - Balance total (VALCRED)
    rows.append(create_flat_file_row(
        row_index=current_row,
        numedoc=numedoc,
        fecha=fecha,
        cuenta=format_with_apostrophe("23355002"),
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
    - Account 23652501: Retefuente 4% (credit) - if tiene_retefuente
    - Account 23355002: Balance total (credit)
    """
    if not request.oficinas:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos una oficina")
    
    # Use today's date if not provided
    fecha_causacion = request.fecha_causacion or date.today()
    fecha_str = format_date_with_apostrophe(fecha_causacion)
    
    # Build description for DETALLE column
    detalle = request.descripcion or f"Fact {request.numero_factura}, {request.proveedor_nombre or ''}"
    
    # Generate all rows
    all_rows = []
    current_row_index = 2  # Excel rows start at 2 (row 1 is headers)
    for oficina in request.oficinas:
        rows, current_row_index = await generate_rows_for_oficina(
            oficina=oficina,
            proveedor_nit=request.proveedor_nit,
            fecha=fecha_str,
            numedoc=request.numedoc,
            tiene_iva=request.tiene_iva,
            tiene_retefuente=request.tiene_retefuente,
            detalle=detalle,
            starting_row_index=current_row_index
        )
        all_rows.extend(rows)
    
    # Create Excel workbook
    wb = Workbook()
    ws = wb.active
    ws.title = "Archivo Plano"
    
    # Write headers
    for col, header in enumerate(HEADERS, 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = Font(bold=True)
    
    # Write data rows
    for row_idx, row_data in enumerate(all_rows, 2):
        for col_idx, value in enumerate(row_data, 1):
            ws.cell(row=row_idx, column=col_idx, value=value)
    
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
    if not request.oficinas:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos una oficina")
    
    fecha_causacion = request.fecha_causacion or date.today()
    fecha_str = format_date_with_apostrophe(fecha_causacion)
    detalle = request.descripcion or f"Fact {request.numero_factura}, {request.proveedor_nombre or ''}"
    
    all_rows = []
    current_row_index = 2  # Excel rows start at 2 (row 1 is headers)
    for oficina in request.oficinas:
        rows, current_row_index = await generate_rows_for_oficina(
            oficina=oficina,
            proveedor_nit=request.proveedor_nit,
            fecha=fecha_str,
            numedoc=request.numedoc,
            tiene_iva=request.tiene_iva,
            tiene_retefuente=request.tiene_retefuente,
            detalle=detalle,
            starting_row_index=current_row_index
        )
        all_rows.extend(rows)
    
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
