from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship
from database import Base

class Proveedor(Base):
    __tablename__ = "proveedores"
    
    id = Column(Integer, primary_key=True, index=True)
    nit = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(255), nullable=False)
    
    # Relationships
    contratos = relationship("Contrato", back_populates="proveedor")

class Oficina(Base):
    __tablename__ = "oficinas"
    
    id = Column(Integer, primary_key=True, index=True)
    cod_oficina = Column(String(50))
    nombre = Column(String(255))
    tipo_sitio = Column(String(100))
    dude = Column(String(50))
    direccion = Column(String(255))
    ciudad = Column(String(100))
    zona = Column(String(100))
    
    contratos = relationship("Contrato", back_populates="oficina")

class Contrato(Base):
    __tablename__ = "contratos"
    
    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"))
    oficina_id = Column(Integer, ForeignKey("oficinas.id"))
    
    # Titular
    titular_nombre = Column(String(255))
    titular_cc_nit = Column(String(50))
    
    # Details
    linea = Column(String(100))
    num_contrato = Column(String(100))
    fecha_inicio = Column(Date)
    fecha_fin = Column(Date)
    estado = Column(String(50))
    observaciones = Column(Text)
    
    # Service Specs
    dude = Column(String(255))
    tipo = Column(String(100))
    ref_pago = Column(String(100))
    tipo_plan = Column(String(100))
    tipo_canal = Column(String(100))
    valor_mensual = Column(Numeric(12, 2))
    archivo_contrato = Column(String(500))  # Path to contract PDF file
    
    # Tax details
    tiene_iva = Column(String(10), default="no")  # "si" or "no"
    tiene_retefuente = Column(String(10), default="no")  # "si" or "no"
    retefuente_pct = Column(Numeric(5, 2))  # e.g., 4 or 6
    
    # Relationships
    proveedor = relationship("Proveedor", back_populates="contratos")
    oficina = relationship("Oficina", back_populates="contratos")
    pagos = relationship("Pago", back_populates="contrato")

class Pago(Base):
    __tablename__ = "pagos"
    
    id = Column(Integer, primary_key=True, index=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id"))
    numero_factura = Column(String(50))
    fecha_pago = Column(Date)
    valor = Column(Numeric(12, 2))
    periodo = Column(String(50))
    notes = Column(Text)
    
    contrato = relationship("Contrato", back_populates="pagos")


class Factura(Base):
    """
    Factura model - allows saving with only proveedor
    Multiple oficinas can be assigned via FacturaOficina, each with its own value
    """
    __tablename__ = "facturas"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Relations - proveedor required
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=False)
    
    # Legacy single oficina/contrato (kept for backward compatibility)
    oficina_id = Column(Integer, ForeignKey("oficinas.id"), nullable=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id"), nullable=True)
    
    # Invoice details
    numero_factura = Column(String(100))
    cufe = Column(String(255))  # CUFE for Colombian electronic invoicing
    fecha_factura = Column(Date)
    fecha_vencimiento = Column(Date)
    valor = Column(Numeric(12, 2))  # Total value of the factura
    
    # Status for workflow: PENDIENTE -> ASIGNADA -> PAGADA
    estado = Column(String(50), default='PENDIENTE')
    
    # URL where the invoice is stored (received via API)
    url_factura = Column(String(500))
    
    # Audit
    created_at = Column(DateTime, server_default=func.now())  # When the invoice was received/uploaded
    observaciones = Column(Text)
    
    # Relationships
    proveedor = relationship("Proveedor")
    oficina = relationship("Oficina")  # Legacy single oficina
    contrato = relationship("Contrato")  # Legacy single contrato
    
    # New: multiple oficinas with individual values
    oficinas_asignadas = relationship("FacturaOficina", back_populates="factura", cascade="all, delete-orphan")


class FacturaOficina(Base):
    """
    Many-to-many relationship between Factura and Oficina
    Each assignment has its own value and can detect the corresponding contrato
    """
    __tablename__ = "factura_oficinas"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Relations
    factura_id = Column(Integer, ForeignKey("facturas.id", ondelete="CASCADE"), nullable=False)
    oficina_id = Column(Integer, ForeignKey("oficinas.id"), nullable=False)
    contrato_id = Column(Integer, ForeignKey("contratos.id"), nullable=True)  # Auto-detected
    
    # Value assigned to this oficina for this factura
    valor = Column(Numeric(12, 2), nullable=False, default=0)
    
    # Status for this specific assignment
    estado = Column(String(50), default='PENDIENTE')  # PENDIENTE, PAGADA
    
    # Audit
    observaciones = Column(Text)
    
    # Relationships
    factura = relationship("Factura", back_populates="oficinas_asignadas")
    oficina = relationship("Oficina")
    contrato = relationship("Contrato")


class FacturaUpload(Base):
    """Tracks PDF uploads and their processing status by n8n"""
    __tablename__ = "factura_uploads"
    
    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(String(50), unique=True, index=True, nullable=False)  # UUID for tracking
    filename = Column(String(255))
    original_filename = Column(String(255))
    file_path = Column(Text)
    file_url = Column(Text)
    
    # Processing status
    status = Column(String(50), default='UPLOADING')  # UPLOADING, PROCESSING, COMPLETED, ERROR
    error_message = Column(Text)
    
    # Result - links to created factura if successful
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    processed_at = Column(DateTime, nullable=True)
    
    # Relationship
    factura = relationship("Factura")
