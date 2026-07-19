"""
2FA (Time-based One-Time Password, RFC 6238) para usuarios.

Diseño mínimo pero completo:
  - Secret base32 de 32 chars generado con `pyotp.random_base32()`.
  - Guardado encriptado con Fernet en `usuarios.two_factor_secret_enc`.
  - Flag `two_factor_enabled` se activa solo tras verificar el primer TOTP
    (así garantizamos que el usuario tiene el token en su app).
  - Al login, si `two_factor_enabled`, exigimos el `totp_code` de 6 dígitos
    junto con email + password.
  - Ventana de tolerancia: 1 paso (±30s) para permitir desincronización de reloj.

Sin depender del backup de códigos de recovery (feature futura).
Sin depender del enrollment por SMS (peligroso).
"""
from __future__ import annotations

from typing import Optional

import pyotp

from services.credentials_encryption import encrypt_str, decrypt_str


def generate_secret() -> str:
    """Genera un secret base32 de 32 chars (160 bits de entropía)."""
    return pyotp.random_base32()


def provisioning_uri(secret: str, user_email: str, issuer: str = "Facturación SaaS") -> str:
    """Devuelve la URI `otpauth://` para renderizar el QR en la UI.

    El frontend usa esta URI con una lib de QR (o el usuario copia el secret
    manualmente en su app tipo Google Authenticator).
    """
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=user_email, issuer_name=issuer)


def verify_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """True si el `code` es un TOTP válido del `secret` en la ventana actual
    (±`valid_window` steps de 30s). El default `valid_window=1` acepta el
    código actual y el anterior — cubre ~60s de desincronización.
    """
    if not secret or not code:
        return False
    # Normalizar el input: quitar espacios/no-dígitos
    normalized = "".join(c for c in code if c.isdigit())
    if len(normalized) != 6:
        return False
    try:
        return pyotp.TOTP(secret).verify(normalized, valid_window=valid_window)
    except Exception:
        return False


def load_user_secret(user) -> Optional[str]:
    """Desencripta el secret del user. None si no hay o falla el decrypt."""
    if not user.two_factor_secret_enc:
        return None
    return decrypt_str(user.two_factor_secret_enc)


def save_user_secret(user, secret: str) -> None:
    """Encripta y guarda. NO commitea — el caller decide."""
    user.two_factor_secret_enc = encrypt_str(secret)
    user.two_factor_enabled = True


def disable_user_2fa(user) -> None:
    """Borra el secret y apaga el flag. NO commitea."""
    user.two_factor_secret_enc = None
    user.two_factor_enabled = False
