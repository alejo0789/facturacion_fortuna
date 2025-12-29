"""
Consolidado Router - Generate consolidated Excel reports from selected invoices
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List
from pydantic import BaseModel
import openpyxl
from openpyxl.drawing.image import Image
from io import BytesIO
from datetime import datetime
import os
from urllib.parse import quote

from database import get_db
import models

router = APIRouter()

# Spanish month abbreviations
MESES_ES = {
    1: 'ENE', 2: 'FEB', 3: 'MAR', 4: 'ABR', 5: 'MAY', 6: 'JUN',
    7: 'JUL', 8: 'AGO', 9: 'SEP', 10: 'OCT', 11: 'NOV', 12: 'DIC'
}


class ConsolidadoRequest(BaseModel):
    factura_ids: List[int]


@router.post("/consolidado/generar")
async def generar_consolidado(
    request: ConsolidadoRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Generate a consolidated Excel file from selected invoices.
    Uses the template and populates the 'info' sheet with invoice data.
    Re-inserts the logo image after modification.
    """
    if not request.factura_ids:
        raise HTTPException(status_code=400, detail="No se seleccionaron facturas")
    
    # Fetch selected facturas with proveedor and oficinas relationships
    result = await db.execute(
        select(models.Factura)
        .options(
            selectinload(models.Factura.proveedor),
            selectinload(models.Factura.oficinas_asignadas)
            .selectinload(models.FacturaOficina.oficina)
        )
        .where(models.Factura.id.in_(request.factura_ids))
    )
    facturas = result.scalars().all()
    
    if not facturas:
        raise HTTPException(status_code=404, detail="No se encontraron las facturas seleccionadas")
    
    # Paths
    base_path = os.path.join(os.path.dirname(__file__), '..', 'Template_consolidado')
    template_path = os.path.join(base_path, 'template_relacion_facturas.xlsx')
    image_path = os.path.join(base_path, 'la fortuna.jpg')
    
    try:
        wb = openpyxl.load_workbook(template_path)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Template no encontrado")
    
    # Get the data sheet (info sheet) - only modify this sheet
    info_sheet = wb['info']
    
    # Populate with factura data starting at row 2
    for idx, factura in enumerate(facturas, start=2):
        # Column A: Fecha de Factura
        info_sheet[f'A{idx}'] = factura.fecha_factura
        
        # Column F: Numero Factura
        info_sheet[f'F{idx}'] = factura.numero_factura or ''
        
        # Column L: Proveedor + Oficinas
        # Format: Proveedor, codigo1, oficina1, codigo2, oficina2, ...
        proveedor_nombre = factura.proveedor.nombre if factura.proveedor else ''
        oficinas_info = []
        for oa in (factura.oficinas_asignadas or []):
            if oa.oficina:
                cod = oa.oficina.cod_oficina or ''
                nombre = oa.oficina.nombre or ''
                oficinas_info.append(f"{cod}, {nombre}")
        
        if oficinas_info:
            proveedor_text = f"{proveedor_nombre}, {', '.join(oficinas_info)}"
        else:
            proveedor_text = proveedor_nombre
        
        info_sheet[f'L{idx}'] = proveedor_text
        
        # Column U: Valor
        info_sheet[f'U{idx}'] = float(factura.valor) if factura.valor else 0
        
        # Column Z: Fecha Recibido (using created_at)
        info_sheet[f'Z{idx}'] = factura.created_at.date() if factura.created_at else factura.fecha_factura
    
    # Re-insert the logo image in F-GFI-2 sheet (it gets lost due to openpyxl limitations)
    if os.path.exists(image_path):
        main_sheet = wb['F-GFI-2']
        img = Image(image_path)
        # Adjust size if needed (width, height in pixels)
        img.width = 150
        img.height = 80
        # Insert at cell A1 (top-left corner)
        main_sheet.add_image(img, 'A1')
    
    # Generate filename with current date
    now = datetime.now()
    dia = str(now.day).zfill(2)
    mes = MESES_ES[now.month]
    anio = now.year
    filename = f"{dia}-{mes}-{anio}-FO-GFI-02RelaciondeFacturasEntregadasV.2.xlsx"
    
    # Save to BytesIO
    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    # URL-encode filename for Content-Disposition header
    encoded_filename = quote(filename)
    
    # Return as downloadable file with proper headers
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )

