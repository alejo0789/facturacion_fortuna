"""
Schemas Pydantic para el módulo contable.
Incluye validador de partida doble (DB == CR) en AsientoContableCreate.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ----------------- PUC -----------------
class CuentaPUCCreate(BaseModel):
    codigo: str
    nombre: str
    naturaleza: str  # DEBITO | CREDITO
    nivel: str  # CLASE | GRUPO | CUENTA | SUBCUENTA | AUXILIAR
    padre_codigo: Optional[str] = None
    permite_movimiento: bool = False
    requiere_tercero: bool = False

    @field_validator("naturaleza")
    @classmethod
    def validar_naturaleza(cls, v: str) -> str:
        v = v.upper()
        if v not in ("DEBITO", "CREDITO"):
            raise ValueError("naturaleza debe ser DEBITO o CREDITO")
        return v

    @field_validator("nivel")
    @classmethod
    def validar_nivel(cls, v: str) -> str:
        v = v.upper()
        if v not in ("CLASE", "GRUPO", "CUENTA", "SUBCUENTA", "AUXILIAR"):
            raise ValueError("nivel inválido")
        return v


class CuentaPUCResponse(BaseModel):
    id: int
    empresa_id: Optional[int] = None
    codigo: str
    nombre: str
    naturaleza: str
    nivel: str
    padre_codigo: Optional[str] = None
    permite_movimiento: bool
    requiere_tercero: bool
    activa: bool

    model_config = {"from_attributes": True}


# ----------------- Periodo -----------------
class PeriodoContableCreate(BaseModel):
    anio: int = Field(..., ge=2000, le=2100)
    mes: int = Field(..., ge=1, le=13)  # 13 = cierre anual


class PeriodoContableResponse(BaseModel):
    id: int
    empresa_id: Optional[int] = None
    anio: int
    mes: int
    estado: str
    cerrado_en: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ----------------- Asientos -----------------
class LineaAsientoCreate(BaseModel):
    cuenta_codigo: str
    nit_tercero: Optional[str] = None
    centro_costo: Optional[str] = None
    debito: Decimal = Decimal("0")
    credito: Decimal = Decimal("0")
    base_impuesto: Optional[Decimal] = None
    detalle: Optional[str] = None

    @field_validator("debito", "credito")
    @classmethod
    def no_negativos(cls, v: Decimal) -> Decimal:
        if v < 0:
            raise ValueError("débito y crédito deben ser ≥ 0")
        return v


class LineaAsientoResponse(BaseModel):
    id: int
    cuenta_codigo: str
    nit_tercero: Optional[str] = None
    centro_costo: Optional[str] = None
    debito: Decimal
    credito: Decimal
    base_impuesto: Optional[Decimal] = None
    detalle: Optional[str] = None

    model_config = {"from_attributes": True}


class AsientoContableCreate(BaseModel):
    fecha: date
    descripcion: Optional[str] = None
    tipo: str  # CAUSACION | PAGO | AJUSTE | APERTURA | CIERRE | MANUAL
    factura_id: Optional[int] = None
    pago_id: Optional[int] = None
    lineas: List[LineaAsientoCreate]

    @field_validator("tipo")
    @classmethod
    def validar_tipo(cls, v: str) -> str:
        v = v.upper()
        if v not in ("CAUSACION", "PAGO", "AJUSTE", "APERTURA", "CIERRE", "MANUAL"):
            raise ValueError("tipo inválido")
        return v

    @field_validator("lineas")
    @classmethod
    def validar_partida_doble(cls, lineas: List[LineaAsientoCreate]):
        if len(lineas) < 2:
            raise ValueError("El asiento debe tener al menos 2 líneas")
        total_debito = sum((l.debito for l in lineas), Decimal("0"))
        total_credito = sum((l.credito for l in lineas), Decimal("0"))
        if total_debito != total_credito:
            raise ValueError(
                f"El asiento no cuadra: DB={total_debito}, CR={total_credito}, "
                f"Diferencia={total_debito - total_credito}"
            )
        if total_debito == 0:
            raise ValueError("El asiento no puede tener totales en cero")
        return lineas


class AsientoContableResponse(BaseModel):
    id: int
    empresa_id: Optional[int] = None
    periodo_id: int
    numero: int
    fecha: date
    descripcion: Optional[str] = None
    tipo: str
    estado: str
    factura_id: Optional[int] = None
    pago_id: Optional[int] = None
    total_debito: Decimal = Decimal("0")
    total_credito: Decimal = Decimal("0")
    lineas: List[LineaAsientoResponse] = []

    model_config = {"from_attributes": True}


# ----------------- Reportes -----------------
class LibroMayorLinea(BaseModel):
    fecha: date
    asiento_numero: int
    descripcion: Optional[str] = None
    debito: Decimal
    credito: Decimal
    saldo: Decimal


class LibroMayorResponse(BaseModel):
    cuenta_codigo: str
    cuenta_nombre: str
    saldo_inicial: Decimal = Decimal("0")
    total_debito: Decimal = Decimal("0")
    total_credito: Decimal = Decimal("0")
    saldo_final: Decimal = Decimal("0")
    movimientos: List[LibroMayorLinea] = []


class BalanceClase(BaseModel):
    codigo: str
    nombre: str
    total_debito: Decimal = Decimal("0")
    total_credito: Decimal = Decimal("0")
    saldo: Decimal = Decimal("0")


class BalanceResponse(BaseModel):
    anio: int
    mes: int
    clases: List[BalanceClase] = []
    total_activos: Decimal = Decimal("0")
    total_pasivos: Decimal = Decimal("0")
    total_patrimonio: Decimal = Decimal("0")
    total_ingresos: Decimal = Decimal("0")
    total_gastos: Decimal = Decimal("0")
    total_costos: Decimal = Decimal("0")
    utilidad_neta: Decimal = Decimal("0")


# ----------------- Impuestos -----------------
class TarifaImpuestoCreate(BaseModel):
    concepto: Optional[str] = None
    tarifa_pct: Decimal
    base_minima: Decimal = Decimal("0")
    es_default: bool = False


class TarifaImpuestoResponse(BaseModel):
    id: int
    concepto: Optional[str] = None
    tarifa_pct: Decimal
    base_minima: Decimal
    es_default: bool

    model_config = {"from_attributes": True}


class ConfiguracionImpuestoCreate(BaseModel):
    tipo: str  # IVA | RETEFUENTE | RETEIVA | RETEICA
    cuenta_puc: Optional[str] = None
    descripcion: Optional[str] = None


class ConfiguracionImpuestoResponse(BaseModel):
    id: int
    empresa_id: Optional[int] = None
    tipo: str
    cuenta_puc: Optional[str] = None
    activo: bool
    descripcion: Optional[str] = None
    tarifas: List[TarifaImpuestoResponse] = []

    model_config = {"from_attributes": True}


class CalcularImpuestosRequest(BaseModel):
    valor_total: Decimal  # Valor bruto con IVA incluido
    proveedor_nit: Optional[str] = None
    tiene_iva: bool = True
    aplica_retefuente: bool = True
    iva_rate_override: Optional[Decimal] = None
    retefuente_rate_override: Optional[Decimal] = None


class CalcularImpuestosResponse(BaseModel):
    valor_total: Decimal  # bruto
    valor_base: Decimal   # sin IVA
    iva_rate: Decimal
    valor_iva: Decimal
    retefuente_pct: Decimal
    valor_retefuente: Decimal
    valor_neto: Decimal   # lo que efectivamente se paga al proveedor
