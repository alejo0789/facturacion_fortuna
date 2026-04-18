"""
Modelos contables multi-tenant — Iteración 2 (Motor Contable).

Basado en Decreto 2649/2650 (Colombia) y portado desde facturacion_fortuna_general.
Todos los modelos contables están scopeados por empresa_id (TenantMixin).

Incluye:
  - CuentaPUC            → Plan Único de Cuentas por empresa
  - PeriodoContable      → Periodos mensuales ABIERTO/CERRADO por empresa
  - AsientoContable      → Cabecera del comprobante
  - LineaAsiento         → Detalle débito/crédito (scopeado vía asiento padre)
  - CuentaBancaria       → Cuentas bancarias por empresa (para conciliación Fase 3)
  - ExtractoBancario     → Extractos importados
  - TransaccionBancaria  → Movimientos del extracto
  - ReglaConciliacion    → Reglas automáticas Banco → Asiento
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    Numeric,
    Text,
    Boolean,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from database import Base
from models_tenant import TenantMixin


# ==========================================================
# Plan Único de Cuentas
# ==========================================================
class CuentaPUC(TenantMixin, Base):
    """
    Plan Único de Cuentas Colombiano (Decreto 2649/2650).
    Cada empresa tiene su propia copia del PUC (clonado al crear la empresa).
    """
    __tablename__ = "cuenta_puc"

    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), nullable=False, index=True)
    nombre = Column(String(255), nullable=False)

    # DEBITO o CREDITO
    naturaleza = Column(String(10), nullable=False)

    # CLASE (1), GRUPO (2), CUENTA (4), SUBCUENTA (6), AUXILIAR (8+)
    nivel = Column(String(20), nullable=False)

    padre_codigo = Column(String(20), nullable=True, index=True)

    # Solo las cuentas auxiliares permiten movimientos
    permite_movimiento = Column(Boolean, default=False, nullable=False)

    # True si requiere NIT del tercero (retenciones, CxC, CxP)
    requiere_tercero = Column(Boolean, default=False, nullable=False)

    activa = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("empresa_id", "codigo", name="uq_puc_empresa_codigo"),
    )


# ==========================================================
# Periodos contables
# ==========================================================
class PeriodoContable(TenantMixin, Base):
    """Periodo contable mensual (1-12) o cierre anual (13)."""
    __tablename__ = "periodo_contable"

    id = Column(Integer, primary_key=True, index=True)
    anio = Column(Integer, nullable=False)
    mes = Column(Integer, nullable=False)  # 1-12, 13=cierre anual

    # ABIERTO | CERRADO
    estado = Column(String(20), default="ABIERTO", nullable=False)

    cerrado_por = Column(Integer, ForeignKey("usuarios.id"), nullable=True)
    cerrado_en = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("empresa_id", "anio", "mes", name="uq_periodo_empresa_anio_mes"),
    )


# ==========================================================
# Asientos contables
# ==========================================================
class AsientoContable(TenantMixin, Base):
    """
    Cabecera del comprobante contable (journal entry).
    La suma de débitos de sus líneas debe igualar la suma de créditos.
    """
    __tablename__ = "asiento_contable"

    id = Column(Integer, primary_key=True, index=True)
    periodo_id = Column(Integer, ForeignKey("periodo_contable.id"), nullable=False, index=True)

    # Número secuencial por empresa + periodo
    numero = Column(Integer, nullable=False)

    fecha = Column(Date, nullable=False, index=True)
    descripcion = Column(Text, nullable=True)

    # CAUSACION | PAGO | AJUSTE | APERTURA | CIERRE | MANUAL
    tipo = Column(String(20), nullable=False)

    # BORRADOR | APROBADO | ANULADO
    estado = Column(String(20), default="BORRADOR", nullable=False)

    # Trazabilidad con módulos operativos (opcional)
    factura_id = Column(Integer, ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True, index=True)
    pago_id = Column(Integer, ForeignKey("pagos.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(Integer, ForeignKey("usuarios.id"), nullable=True)

    # Relationships
    lineas = relationship(
        "LineaAsiento",
        back_populates="asiento",
        cascade="all, delete-orphan",
    )
    periodo = relationship("PeriodoContable")

    __table_args__ = (
        UniqueConstraint("empresa_id", "periodo_id", "numero", name="uq_asiento_empresa_periodo_numero"),
    )


class LineaAsiento(Base):
    """
    Línea individual de débito o crédito.
    No hereda TenantMixin — su tenancy viene del asiento padre (por cascade).
    """
    __tablename__ = "linea_asiento"

    id = Column(Integer, primary_key=True, index=True)
    asiento_id = Column(
        Integer,
        ForeignKey("asiento_contable.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    cuenta_codigo = Column(String(20), nullable=False, index=True)

    # Tercero (NIT) — requerido para ciertas cuentas (retenciones, CxC, CxP)
    nit_tercero = Column(String(50), nullable=True, index=True)

    centro_costo = Column(String(50), nullable=True)

    debito = Column(Numeric(15, 2), default=0, nullable=False)
    credito = Column(Numeric(15, 2), default=0, nullable=False)

    # Base técnica (ej: base gravable de la retención)
    base_impuesto = Column(Numeric(15, 2), nullable=True)

    detalle = Column(Text, nullable=True)

    asiento = relationship("AsientoContable", back_populates="lineas")


# ==========================================================
# Conciliación bancaria (Fase 3 — ya scopeada por empresa)
# ==========================================================
class CuentaBancaria(TenantMixin, Base):
    """Cuenta bancaria física de la empresa."""
    __tablename__ = "cuenta_bancaria"

    id = Column(Integer, primary_key=True, index=True)
    banco = Column(String(100), nullable=False)
    numero_cuenta = Column(String(100), nullable=False)
    tipo_cuenta = Column(String(50), nullable=True)  # Ahorros | Corriente

    # Cuenta PUC asociada (por código, scopeado por empresa)
    cuenta_puc_codigo = Column(String(20), nullable=False)

    activa = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("empresa_id", "banco", "numero_cuenta", name="uq_cuenta_bancaria_empresa"),
    )


class ExtractoBancario(TenantMixin, Base):
    """Extracto bancario importado."""
    __tablename__ = "extracto_bancario"

    id = Column(Integer, primary_key=True, index=True)
    cuenta_bancaria_id = Column(Integer, ForeignKey("cuenta_bancaria.id"), nullable=False, index=True)

    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    saldo_inicial = Column(Numeric(15, 2), default=0, nullable=False)
    saldo_final = Column(Numeric(15, 2), default=0, nullable=False)

    archivo_origen = Column(String(255), nullable=True)
    estado = Column(String(50), default="IMPORTADO", nullable=False)  # IMPORTADO | PROCESANDO | CONCILIADO

    created_at = Column(DateTime, server_default=func.now())

    transacciones = relationship(
        "TransaccionBancaria",
        back_populates="extracto",
        cascade="all, delete-orphan",
    )


class TransaccionBancaria(Base):
    """Transacción leída del extracto. Tenancy vía extracto padre."""
    __tablename__ = "transaccion_bancaria"

    id = Column(Integer, primary_key=True, index=True)
    extracto_id = Column(
        Integer,
        ForeignKey("extracto_bancario.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    fecha = Column(Date, nullable=False)
    descripcion = Column(String(500), nullable=False)
    referencia = Column(String(100), nullable=True)

    monto = Column(Numeric(15, 2), nullable=False)
    # DEBITO (salida) | CREDITO (entrada)
    naturaleza = Column(String(20), nullable=False)

    # NO_CONCILIADO | SUGERIDO | CONCILIADO
    estado_conciliacion = Column(String(50), default="NO_CONCILIADO", nullable=False)

    # Si se concilió, referencia a la línea contable
    linea_asiento_id = Column(Integer, ForeignKey("linea_asiento.id"), nullable=True)

    extracto = relationship("ExtractoBancario", back_populates="transacciones")
    linea_conciliada = relationship("LineaAsiento")


class ReglaConciliacion(TenantMixin, Base):
    """Regla automática para conciliación bancaria."""
    __tablename__ = "regla_conciliacion"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)

    condicion_descripcion = Column(String(255), nullable=True)
    condicion_monto_minimo = Column(Numeric(15, 2), nullable=True)
    condicion_monto_maximo = Column(Numeric(15, 2), nullable=True)

    cuenta_puc_destino = Column(String(20), nullable=True)
    crear_asiento_automatico = Column(Boolean, default=False, nullable=False)
    prioridad = Column(Integer, default=10, nullable=False)

    activa = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
