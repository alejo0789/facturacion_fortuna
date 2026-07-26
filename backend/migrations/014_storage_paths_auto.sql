-- Migración 014: limpieza de storage_path defaults viejos.
--
-- Antes: `empresas.storage_path DEFAULT './storage/facturas'` — todos los
-- tenants terminaban compartiendo la misma carpeta si el admin no lo
-- personalizaba. En Railway (Linux) además el path relativo era ambiguo
-- respecto al cwd del contenedor.
--
-- Ahora: `services/storage_paths.resolve_storage_path()` deriva
-- automáticamente `settings.STORAGE_PATH / <empresa.id>` cuando la columna
-- está NULL. Cada tenant queda aislado en su propio subdirectorio sin
-- intervención del admin.
--
-- Esta migración pone en NULL las filas que tenían el default viejo
-- literal, para que la lógica nueva tome control. Filas con paths
-- personalizados (UNC de SMB, /mnt/algo/, etc.) NO se tocan.

BEGIN;

UPDATE empresas
SET storage_path = NULL
WHERE storage_path = './storage/facturas'
   OR storage_path = '.\\storage\\facturas'
   OR storage_path = '';

-- El nuevo default es NULL (no se declara aquí porque ya lo cambiamos en
-- el modelo). PostgreSQL respeta el default nuevo para inserts futuros.

COMMIT;
