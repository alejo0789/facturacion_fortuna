"""
Encriptación simétrica de secretos que se guardan en BD (refresh tokens,
client secrets, API keys). Usa Fernet — AES-128-CBC + HMAC-SHA256, con
salt y timestamp automáticos.

La FERNET_KEY vive en settings (leída del .env). Nunca en la BD, nunca en
el repo. Generar una con:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Si la key rota, hay que reencriptar todos los tokens existentes. Para
soportar rotación sin downtime, se puede usar MultiFernet con lista de
keys — no lo implemento ahora porque no lo necesitamos aún.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from core.config import settings


class EncryptionNotConfigured(RuntimeError):
    """FERNET_KEY no está seteada en .env."""


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    key = settings.FERNET_KEY
    if not key:
        raise EncryptionNotConfigured(
            "FERNET_KEY no configurada en .env. Genérala con "
            "`python -c \"from cryptography.fernet import Fernet; "
            "print(Fernet.generate_key().decode())\"` y añádela al .env."
        )
    # Fernet acepta la key como bytes o str. Se guarda como str en env.
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_str(plaintext: Optional[str]) -> Optional[str]:
    """Encripta un string. Devuelve el token base64 URL-safe listo para BD.

    Si plaintext es None o "" devuelve None (para que la columna quede NULL
    y no gaste espacio con un token de string vacío).
    """
    if not plaintext:
        return None
    return _get_fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_str(token: Optional[str]) -> Optional[str]:
    """Desencripta un token guardado. Devuelve None si el token es None/"" o
    si la desencriptación falla (por ejemplo, si la FERNET_KEY cambió).
    """
    if not token:
        return None
    try:
        return _get_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken:
        # Log opcional: token inválido → probablemente rotación de key sin
        # migración. Devolvemos None para que el caller lo trate como
        # "no configurado".
        return None
