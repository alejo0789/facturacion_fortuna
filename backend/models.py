from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey, Text, UniqueConstraint, func, Boolean
from sqlalchemy.orm import relationship
from database import Base


# ============================================
# Category System for Role-Based Access
# ============================================

class Categoria(Base):
    """
    Invoice categories (Internet, Servicios Públicos, etc.)
    Each category can be assigned to one or more roles.
    """
    __tablename__ = "categorias"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), unique=True, nullable=False)
    descripcion = Column(Text)
    color = Column(String(7), default='#6366f1')  # Hex color for UI
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String(100))
    
    # Relationships
    roles = relationship("CategoriaRol", back_populates="categoria", cascade="all, delete-orphan")
    usuarios = relationship("CategoriaUsuario", back_populates="categoria", cascade="all, delete-orphan")
    facturas = relationship("Factura", back_populates="categoria")
    contratos = relationship("Contrato", back_populates="categoria")
    proveedores_autorizados = relationship("ProveedorCategoria", back_populates="categoria", cascade="all, delete-orphan")


class CategoriaRol(Base):
    """
    Many-to-many relationship between Categoria and roles from parent system.
    rol_id and rol_nombre come from the parent system's role definitions.
    """
    __tablename__ = "categoria_roles"
    
    id = Column(Integer, primary_key=True, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id", ondelete="CASCADE"), nullable=False)
    rol_id = Column(Integer, nullable=False)  # ID from parent system
    rol_nombre = Column(String(100), nullable=False)  # Cached name from parent system
    created_at = Column(DateTime, server_default=func.now())
    
    # Unique constraint to prevent duplicate assignments
    __table_args__ = (UniqueConstraint('categoria_id', 'rol_id', name='uq_categoria_rol'),)
    
    # Relationships
    categoria = relationship("Categoria", back_populates="roles")


class CategoriaUsuario(Base):
    """
    Many-to-many relationship between Categoria and specific users (by email).
    """
    __tablename__ = "categoria_usuarios"
    
    id = Column(Integer, primary_key=True, index=True)
    categoria_id = Column(Integer, ForeignKey("categorias.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)  # Email of the assigned user
    created_at = Column(DateTime, server_default=func.now())
    
    # Unique constraint to prevent duplicate assignments
    __table_args__ = (UniqueConstraint('categoria_id', 'email', name='uq_categoria_usuario'),)
    
    # Relationships
    categoria = relationship("Categoria", back_populates="usuarios")


class ModuloAccesoRol(Base):
    """
    Roles authorized to access specific modules (e.g., 'PAGOS').
    """
    __tablename__ = "modulo_acceso_roles"
    
    id = Column(Integer, primary_key=True, index=True)
    modulo = Column(String(50), nullable=False)  # e.g., 'PAGOS'
    rol_id = Column(Integer, nullable=False)
    rol_nombre = Column(String(100), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (UniqueConstraint('modulo', 'rol_id', name='uq_modulo_rol'),)


class ModuloAccesoUsuario(Base):
    """
    Specific users (emails) authorized to access specific modules (e.g., 'PAGOS').
    """
    __tablename__ = "modulo_acceso_usuarios"
    
    id = Column(Integer, primary_key=True, index=True)
    modulo = Column(String(50), nullable=False)  # e.g., 'PAGOS'
    email = Column(String(255), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    
    __table_args__ = (UniqueConstraint('modulo', 'email', name='uq_modulo_usuario'),)



class ProveedorCategoria(Base):
    """
    Authorization table: which categories/areas have approved a provider.
    A provider is global but must be authorized per category before being used.
    Tracks who authorized it and when.
    """
    __tablename__ = "proveedor_categorias"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False)
    categoria_id = Column(Integer, ForeignKey("categorias.id", ondelete="CASCADE"), nullable=False)
    autorizado_por = Column(String(255), nullable=True)   # email of who authorized
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (UniqueConstraint('proveedor_id', 'categoria_id', name='uq_proveedor_categoria'),)

    # Relationships
    proveedor = relationship("Proveedor", back_populates="categorias_autorizadas")
    categoria = relationship("Categoria", back_populates="proveedores_autorizados")

class SoporteBancario(Base):
    """
    Soportes de pagos bancarios asociados a proveedores, extraídos desde PDFs.
    """
    __tablename__ = "soportes_bancarios"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=True)
    factura_id = Column(Integer, ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True)
    
    # Extractos de OpenAI
    banco_origen = Column(String(255), nullable=True)
    cuenta_origen = Column(String(255), nullable=True)
    beneficiario = Column(String(255), nullable=True)
    nit_cedula = Column(String(100), nullable=True)
    fecha_pago = Column(Date, nullable=True)
    valor = Column(Numeric(14, 2), nullable=True)
    
    # Archivo en la red
    ruta_archivo = Column(String(1000), nullable=True)
    
    created_at = Column(DateTime, server_default=func.now())
    
    # Relationships
    proveedor = relationship("Proveedor", back_populates="soportes")
    factura = relationship("Factura", back_populates="soportes")


# ============================================
# Core Business Models
# ============================================

class Proveedor(Base):
    __tablename__ = "proveedores"
    
    id = Column(Integer, primary_key=True, index=True)
    nit = Column(String(50), unique=True, nullable=False)
    nombre = Column(String(255), nullable=False)
    nombre_comercial = Column(String(255), nullable=True)  # Commercial name (optional)
    
    # Relationships
    contratos = relationship("Contrato", back_populates="proveedor")
    categorias_autorizadas = relationship("ProveedorCategoria", back_populates="proveedor", cascade="all, delete-orphan")
    soportes = relationship("SoporteBancario", back_populates="proveedor", cascade="all, delete-orphan")

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
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)  # Category for role-based access
    
    # Titular
    titular_nombre = Column(String(255))
    titular_cc_nit = Column(String(50))
    
    # Details
    linea = Column(String(100))
    num_contrato = Column(String(100))
    referencia_contrato = Column(String(100))  # Additional contract reference
    fecha_inicio = Column(Date)
    fecha_fin = Column(Date)
    fecha_instalacion = Column(Date)  # Installation date
    fecha_retiro = Column(Date)  # Removal/retirement date
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
    categoria = relationship("Categoria", back_populates="contratos")
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
    categoria_id = Column(Integer, ForeignKey("categorias.id"), nullable=True)  # Category for role-based access
    
    # Legacy single oficina/contrato (kept for backward compatibility)
    oficina_id = Column(Integer, ForeignKey("oficinas.id"), nullable=True)
    contrato_id = Column(Integer, ForeignKey("contratos.id"), nullable=True)
    
    # Invoice details
    numero_factura = Column(String(100))
    cufe = Column(String(255))  # CUFE for Colombian electronic invoicing
    fecha_factura = Column(Date)
    fecha_vencimiento = Column(Date)
    valor = Column(Numeric(12, 2))  # Total value of the factura
    iva = Column(Numeric(12, 2), nullable=True)  # IVA reported by n8n
    
    # Status for workflow: PENDIENTE -> ASIGNADA -> PAGADA
    estado = Column(String(50), default='PENDIENTE')
    
    # URL where the invoice is stored (received via API)
    url_factura = Column(String(500))
    
    # Audit
    created_at = Column(DateTime, server_default=func.now())  # When the invoice was received/uploaded
    status_updated_at = Column(DateTime, nullable=True)  # When the status was last changed
    observaciones = Column(Text)
    
    # New: Field to keep info if the linked contract is deleted
    info_contrato_audit = Column(Text, nullable=True)
    
    # Relationships
    proveedor = relationship("Proveedor")
    categoria = relationship("Categoria", back_populates="facturas")
    oficina = relationship("Oficina")  # Legacy single oficina
    contrato = relationship("Contrato")  # Legacy single contrato
    soportes = relationship("SoporteBancario", back_populates="factura")
    
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
    
    # New: Field to keep info if the linked contract is deleted
    info_contrato_audit = Column(Text, nullable=True)
    
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
    factura_id = Column(Integer, ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    processed_at = Column(DateTime, nullable=True)
    
    # Relationship
    factura = relationship("Factura")


class ProveedorFeedback(Base):
    """
    Knowledge base for agent feedback.
    Stores user feedback about processed invoices, classified by provider NIT.
    The N8N agent can query this before processing new invoices.
    """
    __tablename__ = "proveedor_feedback"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Relations
    proveedor_id = Column(Integer, ForeignKey("proveedores.id"), nullable=False)
    factura_id = Column(Integer, ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True)  # Optional link to specific invoice
    
    # Feedback content
    descripcion = Column(Text, nullable=False)  # Free-form feedback from user
    
    # Audit
    created_at = Column(DateTime, server_default=func.now())
    created_by = Column(String(100), default="user_system")
    
    # Relationships
    proveedor = relationship("Proveedor")
    factura = relationship("Factura")

class ContratoAuditoria(Base):
    """
    Historical record of deleted contracts to maintain traceability in invoices.
    """
    __tablename__ = "contrato_auditoria"
    
    id = Column(Integer, primary_key=True, index=True)
    original_id = Column(Integer)
    num_contrato = Column(String(100))
    proveedor_nit = Column(String(50))
    proveedor_nombre = Column(String(255))
    oficina_cod = Column(String(50))
    oficina_nombre = Column(String(255))
    valor_mensual = Column(Numeric(12, 2))
    
    # Full JSON snapshot of the contract for deep history
    detalles_completos = Column(Text)
    
    fecha_eliminacion = Column(DateTime, server_default=func.now())
    motivo = Column(String(255), default="Eliminación manual por usuario")
