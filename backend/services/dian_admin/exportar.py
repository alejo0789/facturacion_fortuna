# src/dian_admin/exportar.py
"""
Escritura de CSV con formato adecuado para análisis.

Copia autónoma de src/exportar.py para que el módulo dian_admin pueda
funcionar sin depender del resto del proyecto.
"""
import re

import numpy as np
import pandas as pd


def _a_entero(s: pd.Series) -> pd.Series:
    """Redondea a entero medio-hacia-arriba conservando el signo (NC negativas)."""
    f = pd.to_numeric(s, errors="coerce")
    return (np.sign(f) * np.floor(np.abs(f) + 0.5)).astype("Int64")


def _limpiar_texto(v):
    if isinstance(v, str):
        return re.sub(r"\s+", " ", v).strip()
    return v


def escribir_csv(df: pd.DataFrame, ruta, cols_moneda: tuple = ()) -> None:
    """Escribe el DataFrame a CSV: dinero a pesos enteros y textos sin espacios sobrantes."""
    df = df.copy()
    for c in df.columns:
        if c not in cols_moneda and (df[c].dtype == object or pd.api.types.is_string_dtype(df[c])):
            df[c] = df[c].map(_limpiar_texto)
    for c in cols_moneda:
        if c in df.columns:
            df[c] = _a_entero(df[c])
    df.to_csv(ruta, index=False, encoding="utf-8-sig")
