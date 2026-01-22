# Sistema de Facturación Inteligente con IA

## 📋 Descripción General

Sistema integral de gestión de facturas que combina inteligencia artificial, automatización con n8n e integración con Manager ERP para optimizar el proceso de recepción, procesamiento y contabilización de facturas de proveedores.

## 🎯 Objetivo del Sistema

Automatizar el ciclo completo de gestión de facturas desde su recepción hasta su contabilización en Manager ERP, utilizando IA para extraer información de documentos PDF y n8n para orquestar los flujos de trabajo.

## 🏗️ Arquitectura del Sistema

```
┌─────────────────┐
│   Frontend      │
│   React + TS    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│   Backend API   │◄────►│     n8n      │
│   FastAPI       │      │  Automation  │
└────────┬────────┘      └──────────────┘
         │
         ├──────────────┬──────────────┐
         ▼              ▼              ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ PostgreSQL  │  │   Oracle    │  │   IA OCR    │
│   (Local)   │  │  Manager    │  │  Extraction │
└─────────────┘  └─────────────┘  └─────────────┘
```

## 📚 Documentación Disponible

### 1. [Arquitectura y Tecnologías](./01_Arquitectura/README.md)
- Stack tecnológico completo
- Diagrama de componentes
- Flujo de datos

### 2. [Integración con Manager ERP](./02_Integracion_Manager/README.md)
- Conexión con Oracle Database
- Consulta de oficinas y centros de costos
- Búsqueda de consecutivos
- Sincronización de proveedores

### 3. [Automatización con n8n](./03_Integracion_N8N/README.md)
- Webhooks configurados
- Flujos de trabajo automatizados
- Procesamiento de facturas
- Notificaciones

### 4. [Extracción de Datos con IA](./04_Extraccion_IA/README.md)
- OCR y procesamiento de PDFs
- Extracción de campos clave
- Validación de datos
- Manejo de errores

### 5. [Generación de Reportes](./05_Reportes/README.md)
- Consolidados en Excel
- Archivos planos para contabilidad
- Reportes personalizados
- Dashboard analítico

### 6. [Guías de Usuario](./06_Guias_Usuario/README.md)
- Manual de usuario final
- Carga de facturas
- Asignación de oficinas
- Consulta de estados

### 7. [Instalación y Despliegue](./07_Instalacion/README.md)
- Requisitos del sistema
- Configuración de entornos
- Despliegue en producción
- Troubleshooting

## 🚀 Características Principales

### ✨ Procesamiento Inteligente
- **Extracción automática** de datos de facturas PDF usando IA
- **Validación** de información contra base de datos
- **Detección automática** de proveedores y contratos

### 🔄 Automatización
- **Webhooks n8n** para procesamiento asíncrono
- **Notificaciones** automáticas de estados
- **Flujos de trabajo** configurables

### 📊 Integración Manager ERP
- **Consulta en tiempo real** de oficinas y centros de costos
- **Búsqueda de consecutivos** contables
- **Sincronización** de datos maestros

### 📈 Reportería Avanzada
- **Consolidados Excel** con múltiples hojas
- **Archivos planos** para importación contable
- **Dashboard** con métricas en tiempo real
- **Filtros avanzados** por fecha, oficina, proveedor

## 🔐 Seguridad

- Autenticación mediante API Keys
- CORS configurado para dominios autorizados
- Acceso controlado a recursos de red
- Validación de datos en backend

## 📞 Soporte

Para más información, consulte la documentación específica de cada módulo o contacte al equipo de desarrollo.

---

**Versión:** 1.0  
**Última actualización:** Enero 2026  
**Mantenido por:** Equipo de Tecnología - La Fortuna
