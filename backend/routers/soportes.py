from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.future import select
from database import get_db
import models
import os
import fitz  # PyMuPDF
from openai import AsyncOpenAI
import base64
from datetime import datetime
import json
import logging
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/soportes", tags=["soportes"])
client = AsyncOpenAI() # Usa OPENAI_API_KEY del .env

NETWORK_BASE_PATH = r"\\192.168.2.20\Facturas\soportes"
PROMPT_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts", "soporte_bancario_prompt.txt")

def get_prompt():
    try:
        with open(PROMPT_FILE, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logger.error(f"Error loading prompt: {e}")
        return "Extract banco_origen, cuenta_origen, beneficiario, nit_cedula, fecha_pago, valor into a JSON object."

async def process_page_with_openai(image_bytes: bytes) -> dict:
    """Envía la imagen a OpenAI GPT-4o y devuelve el JSON."""
    base64_image = base64.b64encode(image_bytes).decode('utf-8')
    prompt = get_prompt()
    
    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            response_format={ "type": "json_object" },
            max_tokens=500
        )
        
        content = response.choices[0].message.content
        if content:
            return json.loads(content)
        return {}
    except Exception as e:
        logger.error(f"Error en OpenAI API: {e}")
        return {}

@router.post("/upload")
async def upload_soportes(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Recibe un PDF de múltiples páginas, lo divide, usa OpenAI para extraer datos,
    lo guarda en la red local y registra la información en la BD.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF")
        
    content = await file.read()
    results = []
    
    try:
        # Abrir el PDF original en memoria
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el PDF: {e}")
        
    ahora = datetime.now()
    mes_str = f"{ahora.month:02d}"
    dia_str = f"{ahora.day:02d}"
    
    # Crear carpeta de red: \\192.168.2.20\Facturas\soportes\05\14
    destino_dir = os.path.join(NETWORK_BASE_PATH, mes_str, dia_str)
    try:
        os.makedirs(destino_dir, exist_ok=True)
    except Exception as e:
        logger.error(f"Error creando carpeta de red {destino_dir}: {e}")
        # Para desarrollo, si falla la red, usar carpeta temporal local
        destino_dir = os.path.join(os.getcwd(), "tmp", "soportes", mes_str, dia_str)
        os.makedirs(destino_dir, exist_ok=True)
        logger.info(f"Usando carpeta local de fallback: {destino_dir}")
        
    for i in range(len(doc)):
        page = doc[i]
        
        # 1. Convertir a imagen para OpenAI (resolución media/alta)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_bytes = pix.tobytes("jpeg")
        
        # 2. Consultar a OpenAI
        extraido = await process_page_with_openai(img_bytes)
        nit_extraido = extraido.get("nit_cedula")
        
        # 3. Guardar esa sola página como PDF
        nuevo_doc = fitz.open()
        nuevo_doc.insert_pdf(doc, from_page=i, to_page=i)
        
        nombre_archivo = f"soporte_{ahora.strftime('%Y%m%d%H%M%S')}_pag{i+1}.pdf"
        ruta_guardado = os.path.join(destino_dir, nombre_archivo)
        
        nuevo_doc.save(ruta_guardado)
        nuevo_doc.close()
        
        # 4. Buscar Proveedor por NIT si existe
        proveedor_id = None
        if nit_extraido:
            # Buscar en db
            result = await db.execute(
                select(models.Proveedor).where(models.Proveedor.nit.like(f"%{nit_extraido}%"))
            )
            proveedor = result.scalars().first()
            if proveedor:
                proveedor_id = proveedor.id
                
        # Parse fecha_pago si existe
        fecha_pago_obj = None
        if extraido.get("fecha_pago"):
            try:
                # Tratar de parsear la fecha, OpenAI puede devolver varios formatos, pedimos YYYY-MM-DD
                fecha_pago_obj = datetime.strptime(extraido["fecha_pago"][:10], "%Y-%m-%d").date()
            except:
                pass
                
        valor_parsed = None
        if extraido.get("valor") is not None:
            try:
                valor_parsed = float(extraido["valor"])
            except:
                pass

        # 5. Insertar en BD
        nuevo_soporte = models.SoporteBancario(
            proveedor_id=proveedor_id,
            banco_origen=extraido.get("banco_origen"),
            cuenta_origen=str(extraido.get("cuenta_origen")) if extraido.get("cuenta_origen") else None,
            beneficiario=extraido.get("beneficiario"),
            nit_cedula=str(extraido.get("nit_cedula")) if extraido.get("nit_cedula") else None,
            fecha_pago=fecha_pago_obj,
            valor=valor_parsed,
            ruta_archivo=ruta_guardado
        )
        
        db.add(nuevo_soporte)
        await db.commit()
        await db.refresh(nuevo_soporte)
        
        results.append({
            "pagina": i + 1,
            "soporte_id": nuevo_soporte.id,
            "nit_encontrado": nit_extraido,
            "proveedor_id": proveedor_id,
            "ruta": ruta_guardado,
            "datos": extraido
        })
        
    doc.close()
    
    return {"message": "Soportes procesados correctamente", "detalles": results}

@router.get("/proveedor/{proveedor_id}")
async def get_soportes_by_proveedor(proveedor_id: int, db: Session = Depends(get_db)):
    result = await db.execute(
        select(models.SoporteBancario)
        .where(models.SoporteBancario.proveedor_id == proveedor_id)
        .order_by(models.SoporteBancario.created_at.desc())
    )
    soportes = result.scalars().all()
    return soportes

@router.get("/file/{soporte_id}")
async def get_soporte_file(soporte_id: int, db: Session = Depends(get_db)):
    """Retorna el archivo PDF del soporte físico guardado en la red"""
    result = await db.execute(
        select(models.SoporteBancario).where(models.SoporteBancario.id == soporte_id)
    )
    soporte = result.scalars().first()
    if not soporte or not soporte.ruta_archivo:
        raise HTTPException(status_code=404, detail="Soporte no encontrado o sin archivo")
        
    if not os.path.exists(soporte.ruta_archivo):
        raise HTTPException(status_code=404, detail="El archivo físico no existe en la red")
        
    return FileResponse(
        path=soporte.ruta_archivo,
        media_type="application/pdf",
        filename=os.path.basename(soporte.ruta_archivo)
    )
