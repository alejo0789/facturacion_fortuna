-- Migración 013: 2FA (TOTP) para usuarios
--
-- Añade 2 columnas al modelo Usuario:
--
--   * two_factor_secret_enc  : el secret base32 encriptado con Fernet.
--                              Se genera en /auth/2fa/setup, se guarda
--                              tras verify-setup. Al desactivar se pone NULL.
--   * two_factor_enabled     : boolean flag. True solo tras verify-setup.
--
-- El flow es:
--   1. POST /auth/2fa/setup    → genera secret + provisioning URI, NO lo guarda todavía.
--      Devuelve el secret al frontend para que muestre el QR con `otpauth://`.
--   2. POST /auth/2fa/verify-setup → recibe el TOTP de 6 dígitos y el secret.
--      Si el TOTP verifica, guarda el secret encriptado + set enabled=True.
--   3. POST /auth/login integra el chequeo: si el user tiene 2FA activo y no
--      manda `totp_code`, devuelve HTTP 401 con `code=2fa_required` para que
--      el frontend pida el código.
--   4. POST /auth/2fa/disable  → verifica password + TOTP, luego borra.

BEGIN;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS two_factor_secret_enc TEXT;

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;

-- Backfill (todas las cuentas existentes quedan sin 2FA — pueden activarlo
-- desde su perfil).
UPDATE usuarios SET two_factor_enabled = FALSE WHERE two_factor_enabled IS NULL;

COMMIT;
