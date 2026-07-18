"""Schemas Pydantic de la funcionalidad Conciliación DIAN."""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


# ============================================================================
# Configuración inicial — cédula del representante + periodicidad
# ============================================================================

METODOS_AUTH = ("persona", "administrador", "rep_legal", "usuario_autorizado")
TIPOS_ID = ("CC", "CE", "PP", "TI", "NIT")


class DianConfigIn(BaseModel):
    """Guarda la config no-sensible del método de auth DIAN.

    Los campos son condicionales según `metodo`:
      persona            → cedula_representante + tipo_id
      administrador      → email
      rep_legal          → cedula_representante + tipo_id + nit_empresa_dian
      usuario_autorizado → doc_usuario + tipo_id + nit_empresa_dian

    NOTA: las contraseñas NO se aceptan aquí. Se envían en el body del
    endpoint `/sync/start` cuando corresponde, y se destruyen tras el login.
    """
    metodo: str = Field(..., pattern="^(persona|administrador|rep_legal|usuario_autorizado)$")
    periodicidad: str = Field("bimestral", pattern="^(bimestral|cuatrimestral|anual)$")

    # Campos opcionales (según metodo)
    tipo_id: Optional[str] = Field(None, pattern="^(CC|CE|PP|TI|NIT)$")
    cedula_representante: Optional[str] = Field(None, min_length=5, max_length=25)
    email: Optional[str] = Field(None, min_length=3, max_length=200)
    nit_empresa_dian: Optional[str] = Field(None, min_length=5, max_length=25)
    doc_usuario: Optional[str] = Field(None, min_length=5, max_length=25)


class DianConfigOut(BaseModel):
    metodo: str
    tipo_id: Optional[str] = None
    periodicidad: str
    ultima_sync: Optional[datetime] = None

    # Presencia de credenciales (no exponemos los valores encriptados)
    tiene_cedula: bool
    tiene_email: bool
    tiene_nit_empresa_dian: bool
    tiene_doc_usuario: bool
    tiene_sesion: bool

    # Indica si el próximo sync requerirá que el usuario pegue la contraseña
    # (métodos administrador y usuario_autorizado sin sesión válida).
    requiere_password_en_sync: bool


# ============================================================================
# Sync jobs
# ============================================================================

class SyncJobStart(BaseModel):
    fecha_desde: date
    fecha_hasta: date

    # Contraseña del portal DIAN — solo requerida para los métodos
    # 'administrador' y 'usuario_autorizado' cuando no hay sesión activa
    # (o al forzarla con `force_password_relogin=True`).
    # NUNCA se persiste: vive solo en memoria durante el sync.
    password: Optional[str] = Field(None, min_length=1, max_length=200)
    force_password_relogin: bool = False


class MagicLinkIn(BaseModel):
    link: str = Field(..., min_length=10, max_length=4000)


class SyncJobOut(BaseModel):
    id: int
    empresa_id: int
    fecha_desde: date
    fecha_hasta: date
    estado: str
    mensaje: Optional[str] = None
    creado_en: datetime
    magic_link_recibido_en: Optional[datetime] = None
    completado_en: Optional[datetime] = None
    documentos_nuevos: int = 0
    documentos_actualizados: int = 0
    documentos_totales: int = 0

    class Config:
        from_attributes = True


# ============================================================================
# Documentos DIAN
# ============================================================================

class DocumentoDianOut(BaseModel):
    id: int
    cufe: Optional[str] = None
    prefijo: Optional[str] = None
    folio: Optional[str] = None
    tipo_documento: str
    grupo: Optional[str] = None
    fecha_emision: Optional[date] = None
    nit_emisor: Optional[str] = None
    nombre_emisor: Optional[str] = None
    nit_receptor: Optional[str] = None
    nombre_receptor: Optional[str] = None
    valor: float
    iva: float
    valor_bruto: float
    estado: Optional[str] = None

    class Config:
        from_attributes = True


class DocumentosDianPage(BaseModel):
    items: list[DocumentoDianOut]
    total: int
    page: int
    page_size: int


class ResumenPeriodoIva(BaseModel):
    etiqueta: str
    fecha_desde: date
    fecha_hasta: date
    docs_ventas: int
    docs_compras: int
    iva_ventas: float
    iva_compras: float
    saldo_iva: float
    situacion: str  # 'A PAGAR' | 'A FAVOR' | 'CERO'


# ============================================================================
# Conciliación facturas app ↔ documentos DIAN
# ============================================================================

class ConciliacionItem(BaseModel):
    estado: str                          # 'coincide' | 'diferencia_valor' | 'solo_en_app' | 'solo_en_dian'
    match_por: Optional[str] = None      # 'cufe' | 'folio'
    diferencia_valor: Optional[float] = None

    # Factura de la app
    factura_id: Optional[int] = None
    factura_numero: Optional[str] = None
    factura_proveedor_nit: Optional[str] = None
    factura_proveedor_nombre: Optional[str] = None
    factura_fecha: Optional[date] = None
    factura_valor: Optional[float] = None
    factura_estado: Optional[str] = None

    # Documento DIAN
    documento_dian_id: Optional[int] = None
    dian_cufe: Optional[str] = None
    dian_prefijo: Optional[str] = None
    dian_folio: Optional[str] = None
    dian_tipo: Optional[str] = None
    dian_grupo: Optional[str] = None
    dian_nit_emisor: Optional[str] = None
    dian_nombre_emisor: Optional[str] = None
    dian_fecha_emision: Optional[date] = None
    dian_valor: Optional[float] = None


class ConciliacionResumen(BaseModel):
    total: int
    coincidencias: int
    diferencias_valor: int
    solo_en_app: int
    solo_en_dian: int
    valor_pendiente_registrar: float  # $ en DIAN sin match en la app (compras por descontar)
    valor_sin_soporte_dian: float     # $ en la app sin factura DIAN (riesgo)
    suma_discrepancias: float          # $ absoluto de diferencias en los que sí matchearon


class ConciliacionResponse(BaseModel):
    resumen: ConciliacionResumen
    items: list[ConciliacionItem]


# ============================================================================
# Análisis Estratégico de IVA — dashboard combinado app + DIAN
# ============================================================================

class KPIsIVAOut(BaseModel):
    iva_generado: float
    iva_descontable_app: float
    iva_descontable_dian: float
    iva_no_capturado: float
    saldo_declaracion: float
    saldo_si_capturara_todo: float
    situacion: str  # 'a_pagar' | 'a_favor' | 'cero'
    ratio_captura: float
    ratio_descontable_generado: float
    num_ventas_dian: int
    num_compras_app: int
    num_compras_dian: int
    num_no_capturadas: int
    uvt_anio: float


class TendenciaPeriodoOut(BaseModel):
    etiqueta: str
    fecha_desde: date
    fecha_hasta: date
    iva_generado: float
    iva_descontable: float
    saldo: float
    situacion: str


class ProveedorTopIVAOut(BaseModel):
    nit: str
    nombre: str
    iva_total: float
    num_docs: int


class FacturaHuerfanaOut(BaseModel):
    documento_dian_id: int
    cufe: Optional[str] = None
    prefijo: Optional[str] = None
    folio: Optional[str] = None
    nit_emisor: Optional[str] = None
    nombre_emisor: Optional[str] = None
    fecha_emision: Optional[date] = None
    valor: float
    iva: float


class RecomendacionOut(BaseModel):
    tipo: str
    severidad: str  # 'info' | 'warning' | 'critical'
    titulo: str
    mensaje: str
    impacto_estimado_cop: float


class AnalisisIVAResponse(BaseModel):
    anio: int
    periodicidad: str
    periodo_num: int
    etiqueta: str
    fecha_desde: date
    fecha_hasta: date
    kpis: KPIsIVAOut
    tendencia: list[TendenciaPeriodoOut]
    top_proveedores: list[ProveedorTopIVAOut]
    facturas_no_capturadas: list[FacturaHuerfanaOut]
    recomendaciones: list[RecomendacionOut]
