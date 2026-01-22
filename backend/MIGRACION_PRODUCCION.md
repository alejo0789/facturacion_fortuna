# Guía de Migración a Producción - Oficinas 001/010 y Contratos

## 📋 Resumen de Cambios

Esta migración realiza las siguientes operaciones en la base de datos:

1. **Elimina** oficinas con código '0' y sus referencias en `factura_oficinas`
2. **Resetea** la secuencia de IDs de la tabla `oficinas`
3. **Inserta** 23 oficinas con códigos 001 y 010 desde `proveedores2.xlsx`
4. **Inserta** 20 contratos asociados a estas oficinas

---

## ⚠️ IMPORTANTE - Antes de Ejecutar

### 1. **Hacer Backup de la Base de Datos**

```sql
-- En PostgreSQL, ejecutar:
pg_dump -U postgres -d facturacion > backup_antes_migracion_$(date +%Y%m%d_%H%M%S).sql
```

O desde pgAdmin: Click derecho en la base de datos → Backup

### 2. **Verificar Requisitos**

- ✅ Acceso al servidor de producción
- ✅ Python 3.8+ instalado
- ✅ Dependencias instaladas (`pip install -r requirements.txt`)
- ✅ Archivo `proveedores2.xlsx` en la raíz del proyecto
- ✅ Variable `DATABASE_URL` configurada en `.env`

---

## 🚀 Opción 1: Script Consolidado (Recomendado)

Este método ejecuta todos los pasos automáticamente con una sola confirmación.

### Pasos:

1. **Conectarse al servidor de producción**

2. **Actualizar el código:**
```powershell
cd C:\ruta\al\proyecto
git pull origin main
```

3. **Copiar el archivo Excel:**
   - Asegúrate de que `proveedores2.xlsx` esté en la raíz del proyecto

4. **Ejecutar el script de migración:**
```powershell
cd backend
python migrate_oficinas_produccion.py
```

5. **Confirmar cuando se solicite** (escribir `SI`)

El script ejecutará automáticamente:
- ✅ Paso 1: Borrar oficinas con código '0'
- ✅ Paso 2: Resetear secuencia de IDs
- ✅ Paso 3: Insertar oficinas 001/010
- ✅ Paso 4: Insertar contratos

---

## 🔧 Opción 2: Ejecución Manual Paso a Paso

Si prefieres más control, ejecuta cada script individualmente:

### Paso 1: Borrar oficinas con código '0'
```powershell
python delete_oficinas_zero.py
```

**Resultado esperado:**
```
Referencias borradas: 36
Oficinas borradas: 11
```

### Paso 2: Resetear secuencia de IDs
```powershell
python fix_sequence.py
```

**Resultado esperado:**
```
ID maximo actual en la tabla: 177
Secuencia reseteada. Proximo ID sera: 178
```

### Paso 3: Insertar oficinas 001 y 010
```powershell
python update_oficinas.py
```

**Resultado esperado:**
```
Oficinas nuevas insertadas: 23
```

### Paso 4: Insertar contratos
```powershell
python insert_contratos.py
```

**Resultado esperado:**
```
Contratos insertados: 20
Contratos omitidos: 3
```

---

## ✅ Verificación Post-Migración

Ejecuta estos scripts para verificar que todo se insertó correctamente:

```powershell
# Ver estado de oficinas
python check_oficinas_status.py

# Ver proveedores
python list_proveedores.py
```

### Verificación en la Base de Datos:

```sql
-- Verificar oficinas 001 y 010
SELECT COUNT(*) FROM oficinas WHERE cod_oficina IN ('001', '010');
-- Debe retornar: 23

-- Verificar contratos insertados
SELECT COUNT(*) FROM contratos 
WHERE oficina_id IN (
    SELECT id FROM oficinas WHERE cod_oficina IN ('001', '010')
);
-- Debe retornar: 20

-- Verificar que no hay oficinas con código '0'
SELECT COUNT(*) FROM oficinas WHERE cod_oficina = '0';
-- Debe retornar: 0
```

---

## 🔄 Rollback (En caso de error)

Si algo sale mal, restaura el backup:

```sql
-- Detener la aplicación primero
-- Luego restaurar:
psql -U postgres -d facturacion < backup_antes_migracion_YYYYMMDD_HHMMSS.sql
```

---

## 📝 Notas Adicionales

### Sobre los Contratos Omitidos

3 contratos fueron omitidos porque no tienen NIT de proveedor en el Excel. Esto es normal y esperado.

### Sobre los NITs

Asegúrate de que la columna `nit_proveedor` en `proveedores2.xlsx` (Hoja2) contenga los NITs correctos de los proveedores, no los nombres.

### Conexión a la Base de Datos

El script usa la variable de entorno `DATABASE_URL` del archivo `.env`:

```env
DATABASE_URL=postgresql+asyncpg://usuario:password@host:5432/facturacion
```

---

## 🆘 Solución de Problemas

### Error: "NIT no encontrado en proveedores"
- Verifica que los NITs en `proveedores2.xlsx` coincidan con los de la tabla `proveedores`
- Ejecuta `python list_proveedores.py` para ver los NITs disponibles

### Error: "llave duplicada viola restricción de unicidad"
- Ejecuta primero `python fix_sequence.py` para resetear la secuencia

### Error: "ForeignKeyViolationError"
- Ejecuta `python delete_oficinas_zero.py` para borrar las referencias primero

---

## 📞 Contacto

Si encuentras algún problema durante la migración, contacta al equipo de desarrollo.
