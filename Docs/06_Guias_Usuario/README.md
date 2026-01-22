# Guía de Usuario - Sistema de Facturación con IA

## 👥 Audiencia

Esta guía está dirigida a usuarios finales del sistema: personal de contabilidad, administrativos y gestores de facturas.

## 🚀 Acceso al Sistema

**URL:** `https://saman.lafortuna.com.co/facturacion_ia/`

**Navegadores soportados:**
- Google Chrome (recomendado)
- Microsoft Edge
- Firefox
- Safari

## 📋 Funcionalidades Principales

### 1. Dashboard Principal

Al ingresar al sistema, verás el dashboard con:
- **Resumen anual:** Total facturado, pagado y pendiente
- **Gráfico mensual:** Facturación por mes
- **Top proveedores:** Proveedores con mayor facturación
- **Estados:** Distribución de facturas por estado

### 2. Gestión de Facturas

#### Ver Listado de Facturas

1. Click en "Facturas" en el menú lateral
2. Verás una tabla con todas las facturas
3. Usa los filtros para buscar:
   - Por proveedor
   - Por estado (Pendiente, Asignada, Pagada)
   - Por rango de fechas
   - Por oficina

#### Cargar Nueva Factura

**Opción A: Carga Manual con PDF**

1. Click en botón "Nueva Factura"
2. Arrastra el archivo PDF o click para seleccionar
3. El sistema procesará automáticamente con IA
4. Espera 10-30 segundos
5. Revisa los datos extraídos
6. Confirma o corrige si es necesario

**Opción B: Entrada Manual**

1. Click en "Nueva Factura" → "Entrada Manual"
2. Completa el formulario:
   - **NIT Proveedor:** Requerido
   - **Nombre Proveedor:** Se autocompleta si existe
   - **Número Factura:** Requerido
   - **Fecha Factura:** Requerido
   - **Valor:** Requerido
   - **Fecha Vencimiento:** Opcional
   - **CUFE:** Opcional
3. Click en "Guardar"

#### Asignar Oficinas a una Factura

1. En el listado, click en la factura
2. Click en "Asignar Oficinas"
3. Selecciona una o más oficinas
4. Para cada oficina, ingresa el valor correspondiente
5. Verifica que la suma de valores coincida con el total
6. Click en "Guardar Asignación"

**Nota:** El sistema detectará automáticamente el contrato relacionado.

#### Ver Factura PDF

1. En el listado, click en el ícono de ojo 👁️
2. El PDF se abrirá en una nueva pestaña
3. Puedes descargar o imprimir desde ahí

#### Cambiar Estado de Factura

Los estados son:
- **PENDIENTE:** Sin oficinas asignadas
- **ASIGNADA:** Con oficinas asignadas
- **PAGADA:** Factura pagada

Para cambiar estado:
1. Click en la factura
2. Selecciona el nuevo estado
3. Confirma el cambio

### 3. Generación de Reportes

#### Consolidado de Facturas

1. En "Facturas", selecciona las facturas deseadas (checkbox)
2. Click en "Generar Consolidado"
3. El archivo Excel se descargará automáticamente
4. Nombre del archivo incluye la fecha actual

**Uso del consolidado:**
- Presentación a gerencia
- Archivo para auditoría
- Respaldo mensual

#### Archivo Plano para Manager

1. Filtra facturas por proveedor y mes
2. Selecciona las facturas a procesar
3. Click en "Generar Archivo Plano"
4. Configura parámetros:
   - **¿Tiene IVA?:** Sí/No
   - **Retención en la fuente:** 0%, 4% o 6%
   - **Consecutivo inicial:** Número de documento
5. Click en "Vista Previa" para revisar
6. Si está correcto, click en "Generar"
7. Descarga el archivo Excel

**Importar en Manager:**
1. Abre Manager ERP
2. Ve a Contabilidad → Importar
3. Selecciona el archivo descargado
4. Verifica la importación
5. Confirma

### 4. Gestión de Proveedores

#### Ver Proveedores

1. Click en "Proveedores" en el menú
2. Verás lista de todos los proveedores
3. Busca por NIT o nombre

#### Agregar Proveedor

1. Click en "Nuevo Proveedor"
2. Ingresa:
   - **NIT:** Requerido, solo números
   - **Nombre:** Razón social
   - **Nombre Comercial:** Opcional
3. Click en "Guardar"

### 5. Gestión de Contratos

#### Ver Contratos

1. Click en "Contratos" en el menú
2. Filtra por proveedor u oficina
3. Ve detalles de cada contrato

#### Crear Contrato

1. Click en "Nuevo Contrato"
2. Completa información:
   - Proveedor
   - Oficina
   - Número de contrato
   - Fechas de vigencia
   - Valor mensual
   - Información tributaria (IVA, retención)
3. Opcionalmente, adjunta PDF del contrato
4. Click en "Guardar"

### 6. Consulta de Oficinas

#### Ver Oficinas

1. Click en "Oficinas"
2. Verás lista sincronizada con Manager
3. Información incluye:
   - Código de oficina
   - Nombre
   - Ciudad
   - Centro de costo

**Nota:** Las oficinas se sincronizan desde Manager ERP y no se pueden editar desde aquí.

## 🔍 Búsquedas y Filtros

### Filtros Disponibles

**En Facturas:**
- Búsqueda por texto (proveedor, número, CUFE)
- Estado (Pendiente, Asignada, Pagada)
- Rango de fechas
- Proveedor específico
- Oficina específica

**En Contratos:**
- Proveedor
- Oficina
- Estado (Activo, Inactivo)

### Uso de Búsqueda Rápida

1. Escribe en el campo de búsqueda
2. El sistema filtra en tiempo real
3. Busca en múltiples campos simultáneamente

## 📊 Interpretación del Dashboard

### Métricas Anuales

- **Total Facturado:** Suma de todas las facturas del año
- **Total Pagado:** Facturas con estado PAGADA
- **Total Pendiente:** Facturas PENDIENTE o ASIGNADA

### Gráfico Mensual

- Muestra facturación mes a mes
- Compara con año anterior (si disponible)
- Identifica tendencias

### Top Proveedores

- Los 10 proveedores con mayor facturación
- Útil para negociaciones
- Identifica dependencias

## ⚠️ Mensajes y Alertas

### Tipos de Alertas

**Éxito (Verde):**
- Factura creada correctamente
- Archivo generado exitosamente

**Advertencia (Amarillo):**
- Algunos datos no se pudieron extraer
- Oficina no encontrada

**Error (Rojo):**
- Error al procesar factura
- Archivo no válido
- Datos incompletos

### Qué Hacer en Caso de Error

1. Lee el mensaje de error
2. Verifica los datos ingresados
3. Si persiste, contacta soporte técnico
4. Proporciona el mensaje de error completo

## 💡 Mejores Prácticas

### Al Cargar Facturas

✅ **Hacer:**
- Usar PDFs de buena calidad
- Verificar datos extraídos por IA
- Asignar oficinas inmediatamente
- Mantener nomenclatura consistente

❌ **Evitar:**
- PDFs escaneados de baja calidad
- Dejar facturas sin asignar por mucho tiempo
- Duplicar facturas
- Modificar valores sin verificar

### Al Generar Reportes

✅ **Hacer:**
- Revisar vista previa antes de generar
- Verificar que suma de valores sea correcta
- Validar centros de costo
- Mantener consecutivos ordenados

❌ **Evitar:**
- Generar archivos con datos incompletos
- Importar sin revisar
- Usar consecutivos duplicados

### Organización

- Procesar facturas diariamente
- Generar consolidados semanalmente
- Revisar pendientes mensualmente
- Mantener contratos actualizados

## 🆘 Problemas Comunes

### "No se pudo extraer el NIT"

**Causa:** PDF de mala calidad o formato no estándar

**Solución:**
1. Intenta con entrada manual
2. Solicita factura electrónica al proveedor
3. Mejora calidad del escaneo

### "Oficina no encontrada"

**Causa:** Código de oficina no existe en Manager

**Solución:**
1. Verifica el código en Manager
2. Sincroniza oficinas
3. Contacta administrador si falta oficina

### "Suma de valores no coincide"

**Causa:** Error en distribución de valores

**Solución:**
1. Recalcula los valores
2. Verifica que no falten oficinas
3. Ajusta valores manualmente

### "Error al generar archivo plano"

**Causa:** Datos incompletos o centro de costo no encontrado

**Solución:**
1. Verifica que todas las facturas tengan oficinas
2. Confirma que oficinas existan en Manager
3. Revisa parámetros de IVA y retención

## 📞 Soporte

**Para asistencia técnica:**
- Email: soporte@lafortuna.com.co
- Interno: Extensión 1234
- Horario: Lunes a Viernes, 8:00 AM - 5:00 PM

**Información a proporcionar:**
- Descripción del problema
- Pasos para reproducir
- Capturas de pantalla
- Mensaje de error (si aplica)

---

**Próximo:** [Instalación y Despliegue](../07_Instalacion/README.md)
