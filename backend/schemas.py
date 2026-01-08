from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal

# --- Proveedor Schemas ---
class ProveedorBase(BaseModel):
    nit: str
    nombre: str

class ProveedorCreate(ProveedorBase):
    pass

class Proveedor(ProveedorBase):
    id: int
    class Config:
        from_attributes = True

# --- Oficina Schemas ---
class OficinaBase(BaseModel):
    cod_oficina: Optional[str] = None
    nombre: Optional[str] = None
    tipo_sitio: Optional[str] = None
    dude: Optional[str] = None
    direccion: Optional[str] = None
    ciudad: Optional[str] = None
    zona: Optional[str] = None

class OficinaCreate(OficinaBase):
    pass

class Oficina(OficinaBase):
    id: int
    class Config:
        from_attributes = True

# --- Contrato Schemas ---
class ContratoBase(BaseModel):
    proveedor_id: Optional[int] = None
    oficina_id: Optional[int] = None
    titular_nombre: Optional[str] = None
    titular_cc_nit: Optional[str] = None
    linea: Optional[str] = None
    num_contrato: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    estado: Optional[str] = None
    observaciones: Optional[str] = None
    dude: Optional[str] = None
    tipo: Optional[str] = None
    ref_pago: Optional[str] = None
    tipo_plan: Optional[str] = None
    tipo_canal: Optional[str] = None
    valor_mensual: Optional[Decimal] = None
    archivo_contrato: Optional[str] = None
    tiene_iva: Optional[str] = "no"
    tiene_retefuente: Optional[str] = "no"
    retefuente_pct: Optional[Decimal] = None

class ContratoCreate(ContratoBase):
    pass

class Contrato(ContratoBase):
    id: int
    proveedor: Optional[Proveedor] = None
    oficina: Optional[Oficina] = None
    
    class Config:
        from_attributes = True

# --- Pago Schemas ---
class PagoBase(BaseModel):
    contrato_id: int
    numero_factura: Optional[str] = None
    fecha_pago: date
    valor: Decimal
    periodo: Optional[str] = None
    notes: Optional[str] = None

class PagoCreate(PagoBase):
    pass

class Pago(PagoBase):
    id: int
    
    class Config:
        from_attributes = True


# --- Factura Schemas ---
class FacturaBase(BaseModel):
    proveedor_id: int
    oficina_id: Optional[int] = None
    contrato_id: Optional[int] = None
    numero_factura: Optional[str] = None
    cufe: Optional[str] = None
    fecha_factura: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    valor: Optional[Decimal] = None
    estado: Optional[str] = "PENDIENTE"
    url_factura: Optional[str] = None
    observaciones: Optional[str] = None

class FacturaCreate(FacturaBase):
    """Full factura creation (for internal use)"""
    pass

class FacturaCreateAPI(BaseModel):
    """
    API endpoint for creating factura - only proveedor required
    Oficina and contrato are assigned manually later
    """
    proveedor_id: Optional[int] = None  # Can be None if only NIT is provided
    proveedor_nit: Optional[str] = None  # Alternative: provide NIT to find/create proveedor
    proveedor_nombre: Optional[str] = None  # Name for new proveedor if needed
    numero_factura: Optional[str] = None
    cufe: Optional[str] = None
    fecha_factura: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    valor: Optional[Decimal] = None
    url_factura: Optional[str] = None  # URL where invoice is stored
    observaciones: Optional[str] = None


class OficinaConValor(BaseModel):
    """Oficina assignment with value - uses cod_oficina"""
    cod_oficina: Optional[str] = None  # Código de oficina (puede ser null)
    valor: Decimal
    
    @validator('cod_oficina', pre=True)
    def convert_to_str(cls, v):
        if v is None:
            return None
        return str(v)


class FacturaCreateConOficinas(BaseModel):
    """
    Create factura with optional oficinas using cod_oficina.
    If oficinas is provided, each will be assigned with its valor.
    """
    proveedor_nit: Optional[str] = None  # Opcional: NIT del proveedor
    proveedor_nombre: Optional[str] = None  # Para crear proveedor si no existe
    numero_factura: Optional[str] = None
    cufe: Optional[str] = None
    fecha_factura: Optional[date] = None
    fecha_vencimiento: Optional[date] = None
    valor: Optional[Decimal] = None  # Valor total de la factura
    url_factura: Optional[str] = None
    observaciones: Optional[str] = None
    oficinas: Optional[list[OficinaConValor]] = None  # Opcional: lista de oficinas con valores
    # Campos ignorados (pueden venir pero no se usan)
    contrato_id: Optional[int] = None
    oficina_id: Optional[int] = None
    
    # Validators to handle empty strings (from N8N or other APIs)
    @validator('cufe', 'url_factura', 'proveedor_nit', 'proveedor_nombre', 'numero_factura', pre=True)
    def empty_string_to_none_str(cls, v):
        if v == '' or v == 'null' or v == 'undefined':
            return None
        return v
    
    @validator('fecha_factura', 'fecha_vencimiento', pre=True)
    def empty_string_to_none_date(cls, v):
        if v == '' or v == 'null' or v == 'undefined' or v is None:
            return None
        return v
    
    @validator('valor', pre=True)
    def empty_string_to_none_decimal(cls, v):
        if v == '' or v == 'null' or v == 'undefined' or v is None:
            return None
        return v
    
    class Config:
        extra = 'ignore'  # Ignora campos extra que no están en el schema

class AsignarOficinaRequest(BaseModel):
    """Request to assign oficina to a factura (will auto-detect contrato)"""
    oficina_id: int

# --- FacturaOficina Schemas (many-to-many with individual values) ---

class FacturaOficinaBase(BaseModel):
    oficina_id: int
    valor: Decimal
    estado: Optional[str] = 'PENDIENTE'
    observaciones: Optional[str] = None

class FacturaOficinaCreate(FacturaOficinaBase):
    """Create a new assignment of oficina to factura"""
    pass

class FacturaOficina(FacturaOficinaBase):
    id: int
    factura_id: int
    contrato_id: Optional[int] = None
    oficina: Optional[Oficina] = None
    contrato: Optional[Contrato] = None
    
    class Config:
        from_attributes = True

class AsignarMultiplesOficinasRequest(BaseModel):
    """Request to assign multiple oficinas to a factura"""
    oficinas: list[FacturaOficinaCreate]

# --- Factura Response Schema ---

class Factura(FacturaBase):
    id: int
    proveedor: Optional[Proveedor] = None
    oficina: Optional[Oficina] = None  # Legacy single oficina
    contrato: Optional[Contrato] = None  # Legacy single contrato
    oficinas_asignadas: list[FacturaOficina] = []  # New: multiple oficinas
    created_at: Optional[datetime] = None  # When invoice was received
    
    class Config:
        from_attributes = True

