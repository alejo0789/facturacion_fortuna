-- =========================================================================
-- Migración 001 — Capa SaaS Multi-Tenant
-- Aplicable a una base de datos PostgreSQL existente del proyecto original.
--
-- Esta migración es IDEMPOTENTE y segura para correr varias veces.
--
-- Lo que hace:
--   1. Elimina el UNIQUE global sobre proveedores.nit (ahora será único
--      por empresa, no global).
--   2. Crea el UNIQUE (empresa_id, nit) sobre proveedores.
--
-- Las columnas `empresa_id` y las tablas firmas/empresas/usuarios/
-- usuario_empresa se crean automáticamente por SQLAlchemy create_all()
-- en el arranque de la aplicación (ver main.py → lifespan).
--
-- El backfill de empresa_id a la empresa por defecto también lo hace
-- automáticamente el arranque (ver main.py → _seed_defaults).
--
-- Cómo aplicar:
--   psql -U postgres -d supplier_db -f migrations/001_saas_multitenant.sql
-- =========================================================================

-- 1) Quitar el unique global legado sobre nit
DO $$
DECLARE
    cname text;
BEGIN
    SELECT conname INTO cname
    FROM pg_constraint
    WHERE conrelid = 'proveedores'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) LIKE 'UNIQUE (nit)%';
    IF cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE proveedores DROP CONSTRAINT ' || quote_ident(cname);
        RAISE NOTICE 'Constraint % eliminado', cname;
    END IF;
END
$$;

-- 2) Asegurar unique (empresa_id, nit) (ya se crea por SQLAlchemy, pero por si acaso)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_proveedor_empresa_nit'
    ) THEN
        BEGIN
            ALTER TABLE proveedores
                ADD CONSTRAINT uq_proveedor_empresa_nit UNIQUE (empresa_id, nit);
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'No se pudo crear uq_proveedor_empresa_nit: %', SQLERRM;
        END;
    END IF;
END
$$;

-- Listo. El resto del esquema (firmas, empresas, usuarios, usuario_empresa
-- y las columnas empresa_id en el resto de tablas) lo crea SQLAlchemy.
