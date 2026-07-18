# src/dian_admin/__init__.py
"""
Módulo de acceso al portal DIAN (catalogo-vpfe.dian.gov.co).

Flujo de autenticación: cédula → magic link por email (Opción A, semi-automático).

Uso típico:
    from src.dian_admin.auth import iniciar_sesion_cedula
    from src.dian_admin.documentos import descargar_historico
    from src.dian_admin.iva import calcular_iva
"""
