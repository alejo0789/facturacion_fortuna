"""
Modelos de configuración tributaria multi-tenant.

Permiten que cada empresa configure sus tarifas de IVA, Retefuente, ReteIVA, ReteICA
con valores por defecto que aplican al régimen colombiano estándar.
"""
from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    Boolean,
    DateTime,
    ForeignKey,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from database import Base
from models_tenant import TenantMixin


class ConfiguracionImpuesto(TenantMixin, Base):
    """
    Configuración de un tipo de impuesto para la empresa.
    Tipos: IVA, RETEFUENTE, RETEIVA, RETEICA.
    """
    __tablename__ = "configuracion_impuesto"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(20), nullable=False)  # IVA | RETEFUENTE | RETEIVA | RETEICA
    cuenta_puc = Column(String(20), nullable=True)  # Código PUC asociado
    activo = Column(Boolean, default=True, nullable=False)
    descripcion = Column(String(255), nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("empresa_id", "tipo", name="uq_config_impuesto_empresa_tipo"),
    )

    tarifas = relationship(
        "TarifaImpuesto",
        back_populates="configuracion",
        cascade="all, delete-orphan",
    )


class TarifaImpuesto(Base):
    """
    Tarifa específica dentro de una configuración de impuesto.
    Tenancy vía configuracion padre.
    """
    __tablename__ = "tarifa_impuesto"

    id = Column(Integer, primary_key=True, index=True)
    configuracion_id = Column(
        Integer,
        ForeignKey("configuracion_impuesto.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concepto = Column(String(100), nullable=True)  # Compras, Servicios, Honorarios...
    tarifa_pct = Column(Numeric(5, 2), nullable=False)  # 19.00, 4.00, 6.00
    base_minima = Column(Numeric(15, 2), default=0, nullable=False)
    es_default = Column(Boolean, default=False, nullable=False)

    configuracion = relationship("ConfiguracionImpuesto", back_populates="tarifas")


class RetencionProveedor(TenantMixin, Base):
    """
    Override de retención por proveedor específico (NIT).
    Ej: proveedor del régimen especial con tarifa diferente al default.
    """
    __tablename__ = "retencion_proveedor"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_nit = Column(String(50), nullable=False, index=True)
    configuracion_impuesto_id = Column(
        Integer,
        ForeignKey("configuracion_impuesto.id"),
        nullable=False,
        index=True,
    )
    tarifa_especial_pct = Column(Numeric(5, 2), nullable=False)
    activa = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "proveedor_nit",
            "configuracion_impuesto_id",
            name="uq_retencion_prov_empresa",
        ),
    )

    configuracion = relationship("ConfiguracionImpuesto")
