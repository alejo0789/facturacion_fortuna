from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import io
import datetime

def generar_pdf_nb01(nb_data):
    """
    Genera un PDF idéntico en estructura al de Manager ERP para NOTA BANCARIA (NB01).
    nb_data es un diccionario con:
    - numero_doc (str)
    - fecha (str)
    - detalle_cabecera (str)
    - nit (str)
    - nombre_tercero (str)
    - ccosto_cabecera (str)
    - destino_cabecera (str)
    - valor_total (float)
    - detalles (list of dicts): [{'cuenta', 'desc', 'nit', 'doc_cruce', 'debito', 'credito', 'ccosto', 'destino'}, ...]
    """
    buffer = io.BytesIO()
    
    # Letter 612 x 792 points
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setAuthor("Manager ERP WebApp")
    c.setTitle(f"NB01 - {nb_data.get('numero_doc')}")
    
    # Fuentes (Courier es lo más parecido a la fuente monoespaciada/matricial que usa Manager FRX)
    try:
        font_regular = "Courier"
        font_bold = "Courier-Bold"
    except:
        font_regular = "Helvetica"
        font_bold = "Helvetica-Bold"
        
    def draw_text(x, y, text, size=9, bold=False):
        f = font_bold if bold else font_regular
        c.setFont(f, size)
        c.drawString(x, y, str(text))
        
    def draw_right(x, y, text, size=9, bold=False):
        f = font_bold if bold else font_regular
        c.setFont(f, size)
        c.drawRightString(x, y, str(text))

    # ---- HEADER ----
    # 1. Título principal centrado/arriba derecha
    draw_text(350, 750, "CONTABLE: NOTA BANCARIA", size=11, bold=True)
    draw_text(350, 735, f"NB01 No.        {nb_data.get('numero_doc')}", size=11, bold=True)
    draw_right(570, 765, "Pág. 1 de 1", size=8)

    # 2. Info de la empresa (Izquierda arriba)
    draw_text(60, 760, "LA FORTUNA S.A.", size=12, bold=True)
    draw_text(60, 745, "NIT : 817007005", size=9)
    draw_text(60, 730, "DIRECCION: Calle 4 No 10 22    TELEFONO: 3744844", size=9)
    
    # 3. Datos de cabecera documento
    y_start = 700
    
    # Col 1 Labels
    draw_text(30, y_start, "Vinculado", bold=True)
    draw_text(30, y_start - 15, "C. Costo", bold=True)
    draw_text(30, y_start - 30, "Destino", bold=True)
    draw_text(30, y_start - 45, "Detalle", bold=True)
    
    # Col 1 Separators
    for i in range(4):
        draw_text(100, y_start - (i*15), ":", bold=True)
        
    # Col 1 Values
    draw_text(110, y_start, f"{nb_data.get('nit', '')}")
    draw_text(180, y_start, f"{nb_data.get('nombre_tercero', '')}")
    
    draw_text(110, y_start - 15, f"{nb_data.get('ccosto_cabecera', '.')}")
    draw_text(110, y_start - 30, f"{nb_data.get('destino_cabecera', '.')}")
    # Split detalle Si es muy largo
    det = nb_data.get('detalle_cabecera', '')
    draw_text(110, y_start - 45, det[:80])
    if len(det) > 80:
        draw_text(110, y_start - 55, det[80:160]) # Wrap manual simple

    # Col 2 Info (Derecha)
    draw_text(350, y_start, "Respaldo", bold=True)
    draw_text(420, y_start, ": 0")
    
    draw_text(500, y_start, "Fecha", bold=True)
    draw_text(500, y_start - 15, f"{nb_data.get('fecha', '')}")
    
    draw_text(350, y_start - 15, "Valor", bold=True)
    val_str = "{:,.2f}".format(nb_data.get('valor_total', 0.0))
    draw_text(420, y_start - 15, f": {val_str}")
    
    # ---- BODY (TABLA DE DETALLES) ----
    y_table = y_start - 80
    
    # Tabla NIIF Header Central
    draw_text(200, y_table, "C O N T A B I L I Z A C I O N     N I I F", size=10, bold=True)
    
    y_table -= 25
    c.setLineWidth(1)
    c.line(30, y_table+12, 580, y_table+12)
    
    headers = ["Cuenta", "Descripción", "Vinculado", "Dno.", "Ctr.Inf.", "Doc Cruce", "Debitos", "Creditos"]
    # Alineación ensanchada para permitir 30 letras de descripcion.
    # Posiciones X:
    # 35: Cuenta
    # 90: Desc (90->240: 150 pts aprox 30 letras courier 8)
    # 240: Vinculado
    # 305: Destino
    # 335: Ctr
    # 375: Doc Cruce
    # 445: Debitos (right)
    # 520: Creditos (right)
    xs_h = [35, 90, 240, 305, 335, 375, 460, 535]
    
    for idx, h in enumerate(headers):
        draw_text(xs_h[idx], y_table, h, size=8, bold=True)
        
    c.line(30, y_table-5, 580, y_table-5)
    
    # Rows
    y_table -= 15
    tod_deb = 0.0
    tod_cred = 0.0
    
    for row in nb_data.get('detalles', []):
        draw_text(35, y_table, str(row.get('cuenta', '')).strip(), size=8)
        draw_text(90, y_table, str(row.get('desc', '')).strip()[:30], size=8)  # Permite 30 letras
        draw_text(240, y_table, str(row.get('nit', '')).strip(), size=8)
        draw_text(305, y_table, str(row.get('destino', '.')).strip(), size=8)
        draw_text(335, y_table, str(row.get('ccosto', '.')).strip()[:10], size=8)
        draw_text(375, y_table, str(row.get('doc_cruce', '')).strip(), size=8)
        
        deb = row.get('debito', 0.0)
        cred = row.get('credito', 0.0)
        tod_deb += deb
        tod_cred += cred
        
        # Debitos/Creditos alineados a la derecha de su respectiva columna
        draw_right(500, y_table, "{:,.2f}".format(deb) if deb else "0.00", size=8)
        draw_right(575, y_table, "{:,.2f}".format(cred) if cred else "0.00", size=8)
        
        y_table -= 15

    # ---- FOOTER ----
    # Bajamos la linea un poco para que no raye los numeros de la ultima fila (y_table+15 es el baseline)
    c.line(30, y_table+10, 580, y_table+10)
    y_table -= 5
    draw_text(100, y_table, "TOTALES NIIF", bold=True)
    draw_right(485, y_table, "{:,.2f}".format(tod_deb), bold=True)
    draw_right(570, y_table, "{:,.2f}".format(tod_cred), bold=True)
    c.line(30, y_table-5, 580, y_table-5)
    
    # Firmas
    y_firmas = y_table - 60
    c.line(60, y_firmas, 200, y_firmas)
    draw_text(60, y_firmas-10, "Firma y sello")
    
    c.line(250, y_firmas, 380, y_firmas)
    draw_text(250, y_firmas-10, "Elaboró")
    
    c.line(420, y_firmas, 550, y_firmas)
    draw_text(420, y_firmas-10, "Revisó")
    
    # Footer de sistema abajo
    now_str = datetime.datetime.now().strftime("%Y/%m/%d %H:%M:%S")
    footer_str = f"Software: Manager ERP WebApp (Simulated)        Usuario Imp: PORTAL        Fecha Imp: {now_str}"
    draw_text(30, 30, footer_str, size=6)
    draw_text(30, 20, "www.qualitycolombia.com", size=6)

    c.showPage()
    c.save()
    
    pdf_bytes = buffer.getvalue()
    buffer.close()
    return pdf_bytes
