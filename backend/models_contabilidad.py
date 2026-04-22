from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey, Text, Boolean, func
from sqlalchemy.orm import relationship
from database import Base

class CuentaContable(Base):
    """
    Plan Único de Cuentas (PUC) - Colombia.
    Catálogo central de todas las cuentas.
    """
    __tablename__ = "cuentas_contables"
    
    id = Column(Integer, primary_key=True, index=True)
    codigo = Column(String(20), unique=True, index=True, nullable=False) # e.g. "111005"
    nombre = Column(String(255), nullable=False)
    
    # Clase: 1-Activo, 2-Pasivo, 3-Patrimonio, 4-Ingresos, 5-Gastos, 6-Costos
    clase = Column(String(50))
    
    # DÉBITO o CRÉDITO
    naturaleza = Column(String(20), nullable=False)
    
    # True si es de movimiento (recibe transacciones) o False si es cuenta mayor (solo agrupa)
    es_movimiento = Column(Boolean, default=True)
    
    # Si la legislación colombiana exige asociarle un NIT (Proveedor/Cliente) a la transacción
    requiere_tercero = Column(Boolean, default=False)
    
    # Self-referencing para jerarquías (Cuenta Padre)
    cuenta_padre_id = Column(Integer, ForeignKey("cuentas_contables.id"), nullable=True)
    activa = Column(Boolean, default=True)
    
    # Relationships
    subcuentas = relationship("CuentaContable", backref="cuenta_padre", remote_side=[id])
    movimientos = relationship("MovimientoContable", back_populates="cuenta")


class AsientoContable(Base):
    """
    Cabecera del Comprobante (Journal Entry).
    Representa un evento contable completo (factura, pago, nota de ajuste).
    """
    __tablename__ = "asientos_contables"
    
    id = Column(Integer, primary_key=True, index=True)
    numero_comprobante = Column(String(50), unique=True, index=True) # Ej. CE-001, FC-123
    fecha = Column(Date, nullable=False)
    descripcion = Column(Text, nullable=False)
    
    # BORRADOR, ASENTADO, ANULADO
    estado = Column(String(50), default="BORRADOR")
    
    # Para trazabilidad con los módulos existentes
    origen_tipo = Column(String(50), nullable=True) # "Factura", "Pago", "Conciliacion", "Manual"
    origen_id = Column(Integer, nullable=True) # ID de la factura o el pago original
    
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
    
    # Relationships
    movimientos = relationship("MovimientoContable", back_populates="asiento", cascade="all, delete-orphan")


class MovimientoContable(Base):
    """
    Detalle del Asiento Contable (Journal Entry Lines).
    Cada línea contabiliza un único Débito o Crédito.
    """
    __tablename__ = "movimientos_contables"
    
    id = Column(Integer, primary_key=True, index=True)
    asiento_id = Column(Integer, ForeignKey("asientos_contables.id"), nullable=False)
    cuenta_id = Column(Integer, ForeignKey("cuentas_contables.id"), nullable=False)
    
    # Tercero asociado al movimiento (Opcional, pero requerido en Colombia para cuentas por cobrar/pagar, retenciones)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=True)
    
    debito = Column(Numeric(14, 2), default=0.0)
    credito = Column(Numeric(14, 2), default=0.0)
    
    # La base técnica es usada frecuentemente en Colombia para retenciones (ej. retención sobre X base)
    base_impuesto = Column(Numeric(14, 2), nullable=True)
    descripcion_linea = Column(String(255), nullable=True)
    
    # Concepto de conciliación: Para cruzar con el banco
    estado_conciliacion = Column(String(50), default="NO_CONCILIADO") # NO_CONCILIADO, CONCILIADO
    
    # Relationships
    asiento = relationship("AsientoContable", back_populates="movimientos")
    cuenta = relationship("CuentaContable", back_populates="movimientos")
    proveedor = relationship("Proveedor") # Si es relacionado a un tercero.


class CuentaBancaria(Base):
    """
    Cuentas físicas en instituciones financieras.
    """
    __tablename__ = "cuentas_bancarias"
    
    id = Column(Integer, primary_key=True, index=True)
    banco = Column(String(100), nullable=False) # ej. Bancolombia
    numero_cuenta = Column(String(100), nullable=False)
    tipo_cuenta = Column(String(50)) # Ahorros, Corriente
    
    # Cuenta PUC a la que está atada (e.g. 11100501)
    cuenta_contable_id = Column(Integer, ForeignKey("cuentas_contables.id"), nullable=False)
    
    activa = Column(Boolean, default=True)


class ExtractoBancario(Base):
    """
    Representa un documento/periodo importado del banco.
    """
    __tablename__ = "extractos_bancarios"
    
    id = Column(Integer, primary_key=True, index=True)
    cuenta_bancaria_id = Column(Integer, ForeignKey("cuentas_bancarias.id"), nullable=False)
    
    fecha_inicio = Column(Date, nullable=False)
    fecha_fin = Column(Date, nullable=False)
    saldo_inicial = Column(Numeric(14, 2), default=0.0)
    saldo_final = Column(Numeric(14, 2), default=0.0)
    
    archivo_origen = Column(String(255), nullable=True)
    estado = Column(String(50), default="IMPORTADO") # IMPORTADO, PROCESANDO, CONCILIADO
    
    # Relationships
    transacciones = relationship("TransaccionBancaria", back_populates="extracto", cascade="all, delete-orphan")


class TransaccionBancaria(Base):
    """
    Líneas / Transacciones físicas leídas del extracto.
    """
    __tablename__ = "transacciones_bancarias"
    
    id = Column(Integer, primary_key=True, index=True)
    extracto_id = Column(Integer, ForeignKey("extractos_bancarios.id"), nullable=False)
    
    fecha = Column(Date, nullable=False)
    descripcion = Column(String(500), nullable=False)
    referencia = Column(String(100), nullable=True) # Usualmente numérico
    
    monto = Column(Numeric(14, 2), nullable=False)
    naturaleza = Column(String(20), nullable=False) # DEBITO (Salida de dinero), CREDITO (Entrada de dinero)
    
    estado_conciliacion = Column(String(50), default="NO_CONCILIADO") # NO_CONCILIADO, SUGERIDO, CONCILIADO
    
    # Si ya se concilió, se ata a un movimiento contable o pago
    movimiento_contable_id = Column(Integer, ForeignKey("movimientos_contables.id"), nullable=True)
    
    # Relationships
    extracto = relationship("ExtractoBancario", back_populates="transacciones")
    movimiento_conciliado = relationship("MovimientoContable")


class ReglaConciliacion(Base):
    """
    Reglas personalizadas del sistema para automatizar la asociación Banco -> Asiento.
    """
    __tablename__ = "reglas_conciliacion"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    
    # Condiciones (Guardadas en JSON u texto plano)
    condicion_descripcion = Column(String(255), nullable=True) # Ej: CONTAINS "NOMINA"
    condicion_monto_minimo = Column(Numeric(14, 2), nullable=True)
    condicion_monto_maximo = Column(Numeric(14, 2), nullable=True)
    
    # Acción si cumple la regla
    cuenta_contable_destino_id = Column(Integer, ForeignKey("cuentas_contables.id"), nullable=True)
    crear_asiento_automatico = Column(Boolean, default=False)
    prioridad = Column(Integer, default=10)
    
    activa = Column(Boolean, default=True)
