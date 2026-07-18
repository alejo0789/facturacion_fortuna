# src/dian_admin/iva.py
"""
Transformación y cálculo de IVA sobre los datos descargados del portal DIAN.

Módulo completamente autónomo — no importa nada de src/.

Lógica replicada del pipeline principal (src/transformer.py, src/tipos.py):
  - Notas de crédito → IVA y valor en negativo.
  - valor_bruto = valor_ajustado − iva_ajustado.
  - Filtro de tipos de documento configurable.

Periodicidades colombianas:
  - bimestral    (6 períodos de 2 meses): responsables con ingresos > $1.000M
  - cuatrimestral(3 períodos de 4 meses): responsables con ingresos $100M–$1.000M
  - anual        (1 período):             pequeños responsables
"""
from __future__ import annotations

import calendar
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import pandas as pd


_MESES_ES: dict[int, str] = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}
_MESES_CORTO: dict[int, str] = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
}


# ── Columnas del portal → nombres canónicos ─────────────────────────────────
MAPA_COLUMNAS_PORTAL: dict[str, str] = {
    "Tipo de documento": "tipo_documento",
    "CUFE/CUDE":         "cufe",
    "Folio":             "folio",
    "Prefijo":           "prefijo",
    "Fecha Emisión":     "fecha_emision",
    "Fecha Recepción":   "fecha_recepcion",
    "NIT Emisor":        "nit_emisor",
    "Nombre Emisor":     "nombre_emisor",
    "NIT Receptor":      "nit_receptor",
    "Nombre Receptor":   "nombre_receptor",
    "IVA":               "iva",
    "Rete IVA":          "rete_iva",
    "Rete Renta":        "rete_renta",
    "Rete ICA":          "rete_ica",
    "Total":             "valor",
    "Estado":            "estado",
    "Grupo":             "grupo",
}

# Tipos de documento que se incluyen en el IVA por defecto.
TIPOS_IVA: list[str] = [
    "Factura electrónica",
    "Nota de crédito electrónica",
    # Agregar aquí si el contribuyente maneja otros tipos gravados.
]

# Definición de períodos por periodicidad.
_PERIODOS: dict[str, list[tuple[int, int, str]]] = {
    "bimestral": [
        (1, 2,  "Bimestre 1 — Ene/Feb"),
        (3, 4,  "Bimestre 2 — Mar/Abr"),
        (5, 6,  "Bimestre 3 — May/Jun"),
        (7, 8,  "Bimestre 4 — Jul/Ago"),
        (9, 10, "Bimestre 5 — Sep/Oct"),
        (11,12, "Bimestre 6 — Nov/Dic"),
    ],
    "cuatrimestral": [
        (1, 4,  "Cuatrimestre 1 — Ene/Abr"),
        (5, 8,  "Cuatrimestre 2 — May/Ago"),
        (9, 12, "Cuatrimestre 3 — Sep/Dic"),
    ],
    "anual": [
        (1, 12, "Período anual"),
    ],
}


# ── Utilidades autónomas ─────────────────────────────────────────────────────

def _normalizar(s: str) -> str:
    """Quita tildes, pasa a minúsculas y colapsa espacios."""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).lower().strip()


def _a_numerico(serie: pd.Series) -> pd.Series:
    """
    Convierte una columna con valores monetarios colombianos a float.
    Maneja formatos: '1.234.567,89' / '1234567.89' / '-500.000' / ''.
    """
    limpio = (
        serie.astype(str)
             .str.strip()
             .str.replace(r"\s", "", regex=True)
    )
    # Si contiene tanto punto como coma: el punto es separador de miles
    tiene_coma = limpio.str.contains(",", regex=False)
    limpio = limpio.where(~tiene_coma,
                          limpio.str.replace(r"\.", "", regex=True)
                                .str.replace(",", ".", regex=False))
    return pd.to_numeric(limpio, errors="coerce").fillna(0.0)


# ── Paso 1: canonicalizar columnas del portal ────────────────────────────────

def canonicalizar(df: pd.DataFrame) -> pd.DataFrame:
    """
    Renombra las columnas del Excel del portal DIAN a nombres canónicos
    snake_case para el resto del módulo.
    """
    df = df.copy()
    df.rename(columns={k: v for k, v in MAPA_COLUMNAS_PORTAL.items() if k in df.columns},
              inplace=True)

    # Convertir columnas numéricas monetarias
    for col in ("iva", "valor", "rete_iva", "rete_renta", "rete_ica"):
        if col in df.columns:
            df[col] = _a_numerico(df[col])

    return df


# ── Paso 2: transformar (ajuste de notas de crédito) ────────────────────────

def _es_nota_credito(serie: pd.Series) -> pd.Series:
    """True donde tipo_documento contiene 'nota de credito' (sin tildes)."""
    return serie.astype(str).map(_normalizar).str.contains("nota de credito", na=False)


def transformar(df: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega columnas ajustadas.

      valor_ajustado  = valor  (en negativo si es nota de crédito)
      iva_ajustado    = iva    (en negativo si es nota de crédito)
      valor_bruto     = valor_ajustado − iva_ajustado

    Las notas de crédito DIAN llegan con valores positivos; aquí se
    fuerzan a negativo para que resten al sumar el período.
    """
    df = df.copy()

    if "tipo_documento" not in df.columns:
        df["valor_ajustado"] = df.get("valor", 0.0)
        df["iva_ajustado"]   = df.get("iva",   0.0)
        df["valor_bruto"]    = df["valor_ajustado"] - df["iva_ajustado"]
        return df

    es_nc = _es_nota_credito(df["tipo_documento"])
    n_nc  = int(es_nc.sum())

    df["valor_ajustado"] = df["valor"].where(~es_nc, -df["valor"].abs())
    df["iva_ajustado"]   = df["iva"].where(  ~es_nc, -df["iva"].abs())
    df["valor_bruto"]    = df["valor_ajustado"] - df["iva_ajustado"]

    if n_nc:
        print(f"  NC ajustadas a negativo: {n_nc} registros")
    return df


# ── Paso 3: filtrar por tipo de documento ───────────────────────────────────

def filtrar_tipos(
    df: pd.DataFrame,
    tipos: list[str] = TIPOS_IVA,
) -> pd.DataFrame:
    """
    Deja solo las filas cuyo tipo_documento está en la lista `tipos`.
    La comparación es sin tildes ni distinción de mayúsculas.
    """
    if "tipo_documento" not in df.columns or not tipos:
        return df
    permitidos = {_normalizar(t) for t in tipos}
    mask = df["tipo_documento"].map(_normalizar).isin(permitidos)
    return df[mask].copy()


def _resumen_exclusiones(
    df_ventas: pd.DataFrame,
    df_compras: pd.DataFrame,
    tipos: list[str],
) -> str | None:
    """
    Devuelve una línea con los tipos de documento excluidos del cálculo
    (los que NO están en `tipos`), o None si no hay exclusiones.
    Se calcula sobre el DF total, no por período.
    """
    permitidos = {_normalizar(t) for t in tipos}
    conteos: dict[str, int] = {}
    for df in (df_ventas, df_compras):
        if df is None or df.empty or "tipo_documento" not in df.columns:
            continue
        mask = df["tipo_documento"].map(_normalizar).isin(permitidos)
        for tipo, n in df.loc[~mask, "tipo_documento"].value_counts().items():
            conteos[tipo] = conteos.get(tipo, 0) + int(n)
    if not conteos:
        return None
    partes = ", ".join(
        f"{t} ({n})" for t, n in sorted(conteos.items(), key=lambda x: -x[1])
    )
    total = sum(conteos.values())
    return f"  Tipos no incluidos en IVA ({total} docs): {partes}"


# ── Paso 4: filtrar por fecha ────────────────────────────────────────────────

def filtrar_periodo(
    df: pd.DataFrame,
    fecha_desde: str,
    fecha_hasta: str,
    col_fecha: str = "fecha_emision",
) -> pd.DataFrame:
    """Filtra filas cuya fecha_emision está dentro del período [desde, hasta]."""
    if col_fecha not in df.columns:
        return df
    # El portal DIAN entrega fechas en DD-MM-YYYY; dayfirst=True las maneja.
    fechas = pd.to_datetime(
        df[col_fecha].astype(str).str[:10],
        dayfirst=True, errors="coerce"
    )
    dt_desde = pd.Timestamp(fecha_desde)
    dt_hasta = pd.Timestamp(fecha_hasta)
    return df[(fechas >= dt_desde) & (fechas <= dt_hasta)].copy()


# ── Resultado por período ────────────────────────────────────────────────────

@dataclass
class ResumenPeriodo:
    etiqueta:        str
    fecha_desde:     str
    fecha_hasta:     str
    iva_ventas:      float   # IVA generado (cobrado en ventas)
    iva_compras:     float   # IVA descontable (pagado en compras)
    saldo_iva:       float   # iva_ventas − iva_compras
    valor_ventas:    float
    valor_compras:   float
    bruto_ventas:    float
    bruto_compras:   float
    docs_ventas:     int
    docs_compras:    int
    tipos_ventas:    dict = field(default_factory=dict)
    tipos_compras:   dict = field(default_factory=dict)

    @property
    def situacion(self) -> str:
        if self.saldo_iva > 0:  return "A PAGAR"
        if self.saldo_iva < 0:  return "A FAVOR"
        return "CERO"

    def imprimir(self) -> None:
        print(f"\n  {self.etiqueta}  ({self.fecha_desde} → {self.fecha_hasta})")
        print(f"  {'─'*56}")
        print(f"  Ventas  {self.docs_ventas:>5} docs   IVA generado:     ${self.iva_ventas:>14,.0f}")
        print(f"  Compras {self.docs_compras:>5} docs   IVA descontable:  ${self.iva_compras:>14,.0f}")
        print(f"  {'─'*56}")
        print(f"  Saldo IVA  [{self.situacion:^9}]       ${self.saldo_iva:>14,.0f}")

    def a_dict(self) -> dict:
        return {
            "periodo":       self.etiqueta,
            "fecha_desde":   self.fecha_desde,
            "fecha_hasta":   self.fecha_hasta,
            "docs_ventas":   self.docs_ventas,
            "valor_ventas":  self.valor_ventas,
            "bruto_ventas":  self.bruto_ventas,
            "iva_ventas":    self.iva_ventas,
            "docs_compras":  self.docs_compras,
            "valor_compras": self.valor_compras,
            "bruto_compras": self.bruto_compras,
            "iva_compras":   self.iva_compras,
            "saldo_iva":     self.saldo_iva,
            "situacion":     self.situacion,
        }


# ── Cálculo central ──────────────────────────────────────────────────────────

def calcular_periodo(
    df_ventas:   pd.DataFrame,
    df_compras:  pd.DataFrame,
    fecha_desde: str,
    fecha_hasta: str,
    etiqueta:    str = "",
    tipos:       list[str] = TIPOS_IVA,
) -> ResumenPeriodo:
    """
    Calcula el IVA de un período dado, sobre DataFrames ya canonicalizados
    y transformados.

    Aplica:
      1. Filtro de tipos de documento (facturas + notas de crédito).
      2. Filtro por período de fecha.
      3. Suma iva_ajustado (NC ya están en negativo).
    """
    label = etiqueta or f"{fecha_desde} → {fecha_hasta}"

    def _preparar(df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty:
            return pd.DataFrame()
        df = filtrar_tipos(df, tipos)
        df = filtrar_periodo(df, fecha_desde, fecha_hasta)
        return df

    def _s(df: pd.DataFrame, col: str) -> float:
        return float(df[col].sum()) if (not df.empty and col in df.columns) else 0.0

    v = _preparar(df_ventas)
    c = _preparar(df_compras)

    iva_v = _s(v, "iva_ajustado")
    iva_c = _s(c, "iva_ajustado")

    return ResumenPeriodo(
        etiqueta      = label,
        fecha_desde   = fecha_desde,
        fecha_hasta   = fecha_hasta,
        iva_ventas    = iva_v,
        iva_compras   = iva_c,
        saldo_iva     = iva_v - iva_c,
        valor_ventas  = _s(v, "valor"),
        valor_compras = _s(c, "valor"),
        bruto_ventas  = _s(v, "valor_bruto"),
        bruto_compras = _s(c, "valor_bruto"),
        docs_ventas   = len(v),
        docs_compras  = len(c),
        tipos_ventas  = v["tipo_documento"].value_counts().to_dict() if "tipo_documento" in v.columns else {},
        tipos_compras = c["tipo_documento"].value_counts().to_dict() if "tipo_documento" in c.columns else {},
    )


def periodos_anio(anio: int, periodicidad: str) -> list[tuple[str, str, str]]:
    """
    Genera los períodos (desde, hasta, etiqueta) para el año y periodicidad dados.

    periodicidad: "bimestral" | "cuatrimestral" | "anual"
    """
    definicion = _PERIODOS.get(periodicidad)
    if not definicion:
        raise ValueError(f"Periodicidad '{periodicidad}' no válida. "
                         f"Opciones: {list(_PERIODOS)}")
    resultado = []
    for mes_ini, mes_fin, nombre in definicion:
        ultimo_dia = calendar.monthrange(anio, mes_fin)[1]
        desde = f"{anio}-{mes_ini:02d}-01"
        hasta = f"{anio}-{mes_fin:02d}-{ultimo_dia:02d}"
        etiqueta = f"{anio} — {nombre}"
        resultado.append((desde, hasta, etiqueta))
    return resultado


def calcular_iva_anio(
    df_ventas:    pd.DataFrame,
    df_compras:   pd.DataFrame,
    anio:         int,
    periodicidad: str = "bimestral",
    tipos:        list[str] = TIPOS_IVA,
) -> list[ResumenPeriodo]:
    """
    Calcula el IVA para todos los períodos del año dado según la periodicidad.

    Los DataFrames deben venir YA canonicalizados y transformados
    (usar `canonicalizar()` + `transformar()` antes de llamar esta función).

    Retorna una lista de ResumenPeriodo, uno por período.
    """
    periodos = periodos_anio(anio, periodicidad)
    resultados = []
    for desde, hasta, etiqueta in periodos:
        r = calcular_periodo(df_ventas, df_compras, desde, hasta, etiqueta, tipos)
        resultados.append(r)
    return resultados


def preparar_dataframes(
    df_ventas:  pd.DataFrame | None,
    df_compras: pd.DataFrame | None,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Canonicalizar + transformar dos DataFrames ya separados (ventas / compras).
    """
    def _prep(df: pd.DataFrame | None, nombre: str) -> pd.DataFrame:
        if df is None or df.empty:
            print(f"  ⚠️  Sin datos de {nombre}")
            return pd.DataFrame()
        df = canonicalizar(df)
        df = transformar(df)
        return df

    return _prep(df_ventas, "ventas"), _prep(df_compras, "compras")


def separar_ventas_compras(
    df: pd.DataFrame,
    nit_empresa: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Separa un DataFrame con TODOS los documentos en ventas y compras
    según el NIT emisor, igual que el pipeline principal.

    - Ventas  = nit_emisor == nit_empresa  (la empresa emitió)
    - Compras = nit_emisor != nit_empresa  (un tercero emitió, empresa recibió)

    El DataFrame debe estar ya canonicalizado (columna 'nit_emisor' presente).
    """
    if df is None or df.empty:
        return pd.DataFrame(), pd.DataFrame()
    if "nit_emisor" not in df.columns:
        print("  ⚠️  Columna 'nit_emisor' no encontrada — no se puede separar")
        return pd.DataFrame(), df.copy()

    nit = str(nit_empresa).strip()
    mask = df["nit_emisor"].astype(str).str.strip() == nit
    return df[mask].copy(), df[~mask].copy()


def preparar_y_separar(
    df_raw:      pd.DataFrame | None,
    nit_empresa: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Pipeline completo desde el Excel crudo del portal:
      canonicalizar → transformar → separar_ventas_compras

    Devuelve (df_ventas, df_compras) listos para calcular IVA.
    """
    if df_raw is None or df_raw.empty:
        print("  ⚠️  Sin datos del portal")
        return pd.DataFrame(), pd.DataFrame()
    df = canonicalizar(df_raw)
    df = transformar(df)
    return separar_ventas_compras(df, nit_empresa)


# ── Informe mensual con acumulado ────────────────────────────────────────────

def informe_mensual(
    df_ventas:  pd.DataFrame,
    df_compras: pd.DataFrame,
    anio:       int | None = None,
    tipos:      list[str] = TIPOS_IVA,
) -> pd.DataFrame:
    """
    Genera un informe mes a mes con totales y acumulado progresivo.

    Args:
        df_ventas:  DataFrame de ventas ya canonicalizado y transformado.
        df_compras: DataFrame de compras ya canonicalizado y transformado.
        anio:       Si se indica, filtra solo ese año. None = todos los datos.
        tipos:      Tipos de documento a incluir (facturas + NC por defecto).

    Returns:
        DataFrame con una fila por mes (solo meses con datos) y columnas:
        mes, anio, mes_nombre, docs_ventas, valor_ventas, bruto_ventas,
        iva_ventas, docs_compras, valor_compras, bruto_compras, iva_compras,
        saldo_iva, situacion, acum_iva_ventas, acum_iva_compras,
        acum_saldo_iva, acum_situacion.
    """
    def _extraer_mes(df: pd.DataFrame) -> pd.DataFrame:
        if df is None or df.empty or "fecha_emision" not in df.columns:
            return pd.DataFrame(columns=["_anio", "_mes"])
        df = filtrar_tipos(df.copy(), tipos)
        fechas = pd.to_datetime(
            df["fecha_emision"].astype(str).str[:10],
            dayfirst=True, errors="coerce"
        )
        df = df.copy()
        df["_anio"] = fechas.dt.year.fillna(0).astype(int)
        df["_mes"]  = fechas.dt.month.fillna(0).astype(int)
        if anio is not None:
            df = df[df["_anio"] == anio]
        return df[df["_mes"] > 0]

    v = _extraer_mes(df_ventas)
    c = _extraer_mes(df_compras)

    # Todos los (anio, mes) con datos
    pares_v = set(zip(v["_anio"], v["_mes"])) if not v.empty else set()
    pares_c = set(zip(c["_anio"], c["_mes"])) if not c.empty else set()
    pares   = sorted(pares_v | pares_c)

    filas = []
    for yr, mes in pares:
        vf = v[(v["_anio"] == yr) & (v["_mes"] == mes)] if not v.empty else pd.DataFrame()
        cf = c[(c["_anio"] == yr) & (c["_mes"] == mes)] if not c.empty else pd.DataFrame()

        iva_v = float(vf["iva_ajustado"].sum())  if "iva_ajustado"  in vf.columns else 0.0
        iva_c = float(cf["iva_ajustado"].sum())  if "iva_ajustado"  in cf.columns else 0.0
        saldo = iva_v - iva_c

        filas.append({
            "anio":          yr,
            "mes":           mes,
            "mes_nombre":    _MESES_ES.get(mes, str(mes)),
            "docs_ventas":   len(vf),
            "valor_ventas":  float(vf["valor"].sum())       if "valor"       in vf.columns else 0.0,
            "bruto_ventas":  float(vf["valor_bruto"].sum()) if "valor_bruto" in vf.columns else 0.0,
            "iva_ventas":    iva_v,
            "docs_compras":  len(cf),
            "valor_compras": float(cf["valor"].sum())       if "valor"       in cf.columns else 0.0,
            "bruto_compras": float(cf["valor_bruto"].sum()) if "valor_bruto" in cf.columns else 0.0,
            "iva_compras":   iva_c,
            "saldo_iva":     saldo,
            "situacion":     "A PAGAR" if saldo > 0 else ("A FAVOR" if saldo < 0 else "CERO"),
        })

    if not filas:
        return pd.DataFrame()

    df_res = pd.DataFrame(filas)
    df_res["acum_iva_ventas"]  = df_res["iva_ventas"].cumsum()
    df_res["acum_iva_compras"] = df_res["iva_compras"].cumsum()
    df_res["acum_saldo_iva"]   = df_res["saldo_iva"].cumsum()
    df_res["acum_situacion"]   = df_res["acum_saldo_iva"].map(
        lambda x: "A PAGAR" if x > 0 else ("A FAVOR" if x < 0 else "CERO")
    )
    return df_res


def imprimir_informe_mensual(df_mes: pd.DataFrame) -> None:
    """Imprime el informe mensual con acumulado en consola."""
    if df_mes is None or df_mes.empty:
        print("  (sin datos para informe mensual)")
        return

    W = 88
    print(f"\n{'─'*W}")
    print(
        f"  {'MES':<12} {'V':>5} {'IVA VENTAS':>13}  {'C':>5} {'IVA COMPRAS':>13}"
        f"  {'SALDO MES':>13} {'':>8}  {'ACUMULADO':>13}"
    )
    print(f"  {'─'*W}")

    multi_anio = df_mes["anio"].nunique() > 1

    for _, r in df_mes.iterrows():
        nombre = (f"{_MESES_CORTO.get(r['mes'], str(r['mes']))} {r['anio']}"
                  if multi_anio else r["mes_nombre"])
        print(
            f"  {nombre:<12}"
            f" {r['docs_ventas']:>5} {r['iva_ventas']:>13,.0f}"
            f"  {r['docs_compras']:>5} {r['iva_compras']:>13,.0f}"
            f"  {r['saldo_iva']:>13,.0f} {r['situacion']:>8}"
            f"  {r['acum_saldo_iva']:>13,.0f}  {r['acum_situacion']}"
        )

    print(f"  {'─'*W}")
    print(
        f"  {'TOTAL':<12}"
        f" {df_mes['docs_ventas'].sum():>5} {df_mes['iva_ventas'].sum():>13,.0f}"
        f"  {df_mes['docs_compras'].sum():>5} {df_mes['iva_compras'].sum():>13,.0f}"
        f"  {df_mes['saldo_iva'].sum():>13,.0f}"
    )
    print(f"{'─'*W}")


# ── Compras por emisor mensual ────────────────────────────────────────────────

def informe_compras_por_emisor(
    df_compras: pd.DataFrame,
    anio: int | None = None,
    tipos: list[str] = TIPOS_IVA,
) -> pd.DataFrame:
    """
    Agrupa las compras por NIT emisor y mes, con acumulado al cierre de cada mes.

    Retorna un DataFrame en formato largo:
        nit_emisor, nombre_emisor, mes, mes_nombre,
        docs, valor_bruto, iva, acum_valor_bruto, acum_iva
    ordenado por acumulado total desc (los proveedores más grandes primero).
    """
    if df_compras is None or df_compras.empty:
        return pd.DataFrame()

    df = filtrar_tipos(df_compras, tipos)
    if df.empty:
        return pd.DataFrame()

    if anio:
        df = filtrar_periodo(df, f"{anio}-01-01", f"{anio}-12-31")
    if df.empty:
        return pd.DataFrame()

    fechas = pd.to_datetime(
        df["fecha_emision"].astype(str).str[:10],
        dayfirst=True, errors="coerce",
    )
    df = df.copy()
    df["_mes"] = fechas.dt.month
    df = df.dropna(subset=["_mes"])
    df["_mes"] = df["_mes"].astype(int)

    if df.empty:
        return pd.DataFrame()

    # Nombre representativo por NIT (el más frecuente)
    nombre_repr = (
        df.groupby("nit_emisor")["nombre_emisor"]
        .agg(lambda s: s.value_counts().index[0] if len(s) else "")
        .rename("nombre_emisor")
    )

    grp = (
        df.groupby(["nit_emisor", "_mes"])
        .agg(docs=("valor_bruto", "count"),
             valor_bruto=("valor_bruto", "sum"),
             iva=("iva_ajustado", "sum"))
        .reset_index()
    )
    grp = grp.merge(nombre_repr, on="nit_emisor", how="left")

    # Ordenar proveedores por total anual descendente
    totales = grp.groupby("nit_emisor")["valor_bruto"].sum()
    grp["_orden"] = grp["nit_emisor"].map(totales)
    grp = grp.sort_values(["_orden", "nit_emisor", "_mes"], ascending=[False, True, True])

    # Acumulado por emisor a lo largo de los meses
    grp["acum_valor_bruto"] = grp.groupby("nit_emisor")["valor_bruto"].cumsum()
    grp["acum_iva"] = grp.groupby("nit_emisor")["iva"].cumsum()

    grp["mes_nombre"] = grp["_mes"].map(_MESES_ES)
    return (
        grp[["nit_emisor", "nombre_emisor", "_mes", "mes_nombre",
             "docs", "valor_bruto", "iva", "acum_valor_bruto", "acum_iva"]]
        .rename(columns={"_mes": "mes"})
        .reset_index(drop=True)
    )


def imprimir_compras_por_emisor(df: pd.DataFrame) -> None:
    """Imprime el informe de compras por emisor en formato de pivot mes × emisor."""
    if df is None or df.empty:
        print("  (sin datos de compras por emisor)")
        return

    meses_presentes = sorted(df["mes"].unique())
    col_meses = [_MESES_CORTO[m] for m in meses_presentes]

    # Pivot: una fila por emisor, una columna por mes
    pivot = df.pivot_table(
        index=["nit_emisor", "nombre_emisor"],
        columns="mes",
        values="valor_bruto",
        aggfunc="sum",
        fill_value=0,
    )
    pivot.columns = [_MESES_CORTO[c] for c in pivot.columns]
    pivot["TOTAL"] = pivot.sum(axis=1)
    pivot = pivot.sort_values("TOTAL", ascending=False).reset_index()

    ancho_nit    = 12
    ancho_nombre = 28
    ancho_col    = 13
    cols_num     = col_meses + ["TOTAL"]
    W = ancho_nit + 1 + ancho_nombre + len(cols_num) * (ancho_col + 1)

    print(f"\n{'─'*W}")
    hdr = (f"  {'NIT':<{ancho_nit}} {'NOMBRE':<{ancho_nombre}}"
           + "".join(f" {c:>{ancho_col}}" for c in cols_num))
    print(hdr)
    print(f"  {'─'*W}")

    for _, r in pivot.iterrows():
        nombre = str(r["nombre_emisor"])[:ancho_nombre]
        fila = (f"  {str(r['nit_emisor']):<{ancho_nit}} {nombre:<{ancho_nombre}}"
                + "".join(f" {r[c]:>{ancho_col},.0f}" for c in cols_num))
        print(fila)

    print(f"  {'─'*W}")
    totales_col = pivot[cols_num].sum()
    fila_tot = (f"  {'TOTAL':<{ancho_nit}} {'':<{ancho_nombre}}"
                + "".join(f" {totales_col[c]:>{ancho_col},.0f}" for c in cols_num))
    print(fila_tot)
    print(f"{'─'*W}")
