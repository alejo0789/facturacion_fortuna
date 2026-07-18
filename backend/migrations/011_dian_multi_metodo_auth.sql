-- Migración 011: soporte multi-método de autenticación DIAN
--
-- La versión inicial (migración 010) solo soportaba autenticación por Cédula
-- + Magic Link (tab "Persona" del portal). El portal catalogo-vpfe.dian.gov.co
-- expone tres puertas más:
--
--   • Administrador          → correo electrónico + contraseña
--   • Empresa · Rep. Legal   → tipo doc + cédula rep legal + NIT empresa (magic link)
--   • Empresa · Usuario Autz → NIT empresa + tipo doc + cédula + contraseña
--
-- Política de seguridad: las CONTRASEÑAS del portal NUNCA se persisten en BD.
-- Solo el usuario las envía al momento de disparar el sync; el backend las
-- conserva en memoria del thread de Playwright, hace login, guarda el
-- storage_state encriptado (`dian_sesion_estado_enc`) y descarta el password.
-- Cuando la sesión expira (~30min inactividad), el sistema solicita al usuario
-- volver a pegar la contraseña.
--
-- Campos NO sensibles (email, NITs, tipo de doc) se pueden guardar encriptados
-- también para no exponer identidad del rep legal en el snapshot de BD.

BEGIN;

-- Método de autenticación configurado. Valores permitidos:
--   'persona'            → cédula rep legal + magic link  (default, comportamiento previo)
--   'administrador'      → correo + contraseña
--   'rep_legal'          → tipo doc + cédula rep + NIT empresa + magic link
--   'usuario_autorizado' → NIT empresa + tipo doc + cédula usuario + contraseña
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS dian_metodo_auth VARCHAR(30) DEFAULT 'persona';

-- Tipo de identificación en el portal DIAN. Valores del select del portal:
--   'CC' Cédula de ciudadanía · 'CE' Cédula de extranjería · 'PP' Pasaporte
--   'TI' Tarjeta de identidad · 'NIT' NIT (personas jurídicas)
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS dian_tipo_id VARCHAR(4) DEFAULT 'CC';

-- Correo del "Administrador" DIAN (encriptado Fernet)
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS dian_email_enc TEXT;

-- NIT de la empresa según DIAN, cuando difiere del NIT interno (encriptado)
-- Se usa en métodos 'rep_legal' y 'usuario_autorizado'.
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS dian_nit_empresa_dian_enc TEXT;

-- Número de documento del Usuario Autorizado (encriptado)
-- Se usa en método 'usuario_autorizado'.
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS dian_doc_usuario_enc TEXT;

-- Backfill: todos los tenants que ya tenían cédula configurada quedan en
-- método 'persona' (que era el único disponible antes de esta migración).
UPDATE empresas SET dian_metodo_auth = 'persona'
    WHERE dian_metodo_auth IS NULL;

COMMIT;
