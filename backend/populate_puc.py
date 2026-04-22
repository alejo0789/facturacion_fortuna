import json
import os
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models_contabilidad

# Initialize tables
models_contabilidad.Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Estructura del PUC Colombiano Básico (Nivel Clase, Grupo, Cuenta)
PUC_DATA = [
    # Clase 1: Activo
    {"codigo": "1", "nombre": "Activo", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": False, "padre": None},
    {"codigo": "11", "nombre": "Disponible", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": False, "padre": "1"},
    {"codigo": "1105", "nombre": "Caja", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": False, "padre": "11"},
    {"codigo": "110505", "nombre": "Caja general", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": True, "padre": "1105"},
    {"codigo": "1110", "nombre": "Bancos", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": False, "padre": "11"},
    {"codigo": "111005", "nombre": "Moneda nacional", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": True, "padre": "1110"},
    {"codigo": "13", "nombre": "Deudores", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": False, "padre": "1"},
    {"codigo": "1305", "nombre": "Clientes", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": False, "padre": "13"},
    {"codigo": "130505", "nombre": "Nacionales", "clase": "1", "naturaleza": "DEBITO", "es_movimiento": True, "padre": "1305", "requiere_tercero": True},
    
    # Clase 2: Pasivo
    {"codigo": "2", "nombre": "Pasivo", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": None},
    {"codigo": "22", "nombre": "Proveedores", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "2"},
    {"codigo": "2205", "nombre": "Nacionales", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "22"},
    {"codigo": "220501", "nombre": "Proveedores nacionales", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": True, "padre": "2205", "requiere_tercero": True},
    {"codigo": "23", "nombre": "Cuentas por pagar", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "2"},
    {"codigo": "2365", "nombre": "Retención en la fuente", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "23"},
    {"codigo": "236540", "nombre": "Compras", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": True, "padre": "2365", "requiere_tercero": True},
    {"codigo": "24", "nombre": "Impuestos, gravámenes y tasas", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "2"},
    {"codigo": "2408", "nombre": "Impuesto sobre las ventas por pagar", "clase": "2", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "24"},
    
    # Clase 3: Patrimonio
    {"codigo": "3", "nombre": "Patrimonio", "clase": "3", "naturaleza": "CREDITO", "es_movimiento": False, "padre": None},
    {"codigo": "31", "nombre": "Capital social", "clase": "3", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "3"},
    
    # Clase 4: Ingresos
    {"codigo": "4", "nombre": "Ingresos", "clase": "4", "naturaleza": "CREDITO", "es_movimiento": False, "padre": None},
    {"codigo": "41", "nombre": "Operacionales", "clase": "4", "naturaleza": "CREDITO", "es_movimiento": False, "padre": "4"},
    {"codigo": "4135", "nombre": "Comercio al por mayor y al por menor", "clase": "4", "naturaleza": "CREDITO", "es_movimiento": True, "padre": "41"},
    
    # Clase 5: Gastos
    {"codigo": "5", "nombre": "Gastos", "clase": "5", "naturaleza": "DEBITO", "es_movimiento": False, "padre": None},
    {"codigo": "51", "nombre": "Operacionales de administración", "clase": "5", "naturaleza": "DEBITO", "es_movimiento": False, "padre": "5"},
]

def poblar_puc():
    db = SessionLocal()
    
    print("Iniciando la carga del PUC de Colombia...")
    # Diccionario para rápido acceso y asignación de padre por ID real en BD
    codigos_db_ids = {}
    
    # Ordenar por nivel (longitud del código) para insertar de arriba hacia abajo
    puc_ordenado = sorted(PUC_DATA, key=lambda x: len(x["codigo"]))
    
    for item in puc_ordenado:
        # Check if already exists
        existe = db.query(models_contabilidad.CuentaContable).filter(
            models_contabilidad.CuentaContable.codigo == item["codigo"]
        ).first()
        
        if not existe:
            padre_id = None
            if item["padre"] and item["padre"] in codigos_db_ids:
                padre_id = codigos_db_ids[item["padre"]]
            
            nueva_cuenta = models_contabilidad.CuentaContable(
                codigo=item["codigo"],
                nombre=item["nombre"],
                clase=item["clase"],
                naturaleza=item["naturaleza"],
                es_movimiento=item["es_movimiento"],
                requiere_tercero=item.get("requiere_tercero", False),
                cuenta_padre_id=padre_id,
                activa=True
            )
            db.add(nueva_cuenta)
            db.flush() # Para obtener el ID autogenerado
            codigos_db_ids[item["codigo"]] = nueva_cuenta.id
            print(f"✅ Cuenta insertada: {item['codigo']} - {item['nombre']}")
        else:
            codigos_db_ids[item["codigo"]] = existe.id
            print(f"⚠️ Conta existente omitida: {item['codigo']}")
            
    db.commit()
    db.close()
    print("¡PUC básico cargado exitosamente!")

if __name__ == "__main__":
    poblar_puc()
