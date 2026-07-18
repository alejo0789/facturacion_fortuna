"""
Modelos SQLAlchemy de la funcionalidad Conciliación DIAN.

Se separa de models_tenant.py porque es una vertical grande (histórico oficial
de facturación electrónica descargado del portal catalogo-vpfe.dian.gov.co +
jobs de sincronización) que no forma parte del núcleo del tenant.

Migración: 010_conciliacion_dian.sql.
"""
from __future__ import annotations

from sqlalchemy import (
    Column, Integer, String, Text, ForeignKey, Numeric, DateTime, Date
)
from sqlalchemy.sql import func

from database import Base


class DocumentoDian(Base):
    """Documento electrónico oficial (factura o nota) descargado del portal DIAN.

    Cada fila corresponde a un CUFE (o combinación prefijo+folio+nit_emisor
    cuando el CUFE no está poblado). La tabla se usa para cruzar contra
    `facturas` (lo que el usuario procesó en la app) y detectar diferencias.
    """
    __tablename__ = "documentos_dian"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    # Identificadores del documento electrónico
    cufe = Column(String(100), index=True)
    prefijo = Column(String(20))
    folio = Column(String(50))
    tipo_documento = Column(String(80), nullable=False)
    grupo = Column(String(20))  # "Emitidos" (venta) o "Recibidos" (compra)

    # Fechas
    fecha_emision = Column(Date)
    fecha_recepcion = Column(Date)

    # Emisor / receptor
    nit_emisor = Column(String(30))
    nombre_emisor = Column(String(500))
    nit_receptor = Column(String(30))
    nombre_receptor = Column(String(500))

    # Valores monetarios en COP (tal como los trae DIAN, sin normalizar signos)
    valor = Column(Numeric(18, 2), default=0)
    iva = Column(Numeric(18, 2), default=0)
    rete_iva = Column(Numeric(18, 2), default=0)
    rete_renta = Column(Numeric(18, 2), default=0)
    rete_ica = Column(Numeric(18, 2), default=0)

    # Valores ajustados (NC en negativo, valor_bruto = valor - iva)
    valor_ajustado = Column(Numeric(18, 2), default=0)
    iva_ajustado = Column(Numeric(18, 2), default=0)
    valor_bruto = Column(Numeric(18, 2), default=0)

    # Estado del documento en el portal DIAN
    estado = Column(String(80))

    # Metadata local
    downloaded_at = Column(DateTime, server_default=func.now())
    sync_job_id = Column(Integer)  # sin FK formal para permitir borrar el job


class DianSyncJob(Base):
    """Un intento de sincronización con el portal DIAN.

    Estados:
      pending_magic_link → el backend está esperando que el usuario pegue
                           el link que la DIAN envió a su correo.
      in_progress        → login OK, descargando y parseando XLSX.
      completed          → sync exitoso; `documentos_totales` refleja lo
                           que se descargó.
      failed             → algo se rompió; `mensaje` explica qué.
    """
    __tablename__ = "dian_sync_jobs"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id", ondelete="CASCADE"),
                        nullable=False, index=True)

    # Rango solicitado
    fecha_desde = Column(Date, nullable=False)
    fecha_hasta = Column(Date, nullable=False)

    # Estado del job
    estado = Column(String(30), nullable=False, default="pending_magic_link")
    mensaje = Column(Text)

    # Timings
    creado_en = Column(DateTime, server_default=func.now())
    magic_link_recibido_en = Column(DateTime)
    completado_en = Column(DateTime)

    # Resultado
    documentos_nuevos = Column(Integer, default=0)
    documentos_actualizados = Column(Integer, default=0)
    documentos_totales = Column(Integer, default=0)
