"""
Oracle Database Connection Module
Provides connection to MANAMED Oracle database
"""
import oracledb
import os
from dotenv import load_dotenv
from typing import Optional, List, Dict, Any

load_dotenv()

# Oracle connection settings
ORACLE_HOST = os.getenv("ORACLE_HOST", "172.18.114.70")
ORACLE_PORT = int(os.getenv("ORACLE_PORT", "1521"))
ORACLE_SERVICE = os.getenv("ORACLE_SERVICE", "MANAMED")
ORACLE_USER = os.getenv("ORACLE_USER", "WMENDEZ")
ORACLE_PASSWORD = os.getenv("ORACLE_PASSWORD", "Ur-?*QWY5p*z@gnC")


def get_oracle_connection():
    """
    Creates and returns an Oracle database connection.
    Uses thin mode (no Oracle Client required).
    """
    try:
        # Using thin mode - no Oracle Instant Client required
        connection = oracledb.connect(
            user=ORACLE_USER,
            password=ORACLE_PASSWORD,
            host=ORACLE_HOST,
            port=ORACLE_PORT,
            service_name=ORACLE_SERVICE
        )
        return connection
    except oracledb.Error as e:
        print(f"Error connecting to Oracle: {e}")
        raise


def get_oficina_by_codigo(codigo: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves office and cost center information by office code.
    
    Args:
        codigo: The office code (DNOCODIGO)
    
    Returns:
        Dictionary with office information or None if not found
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        query = """
            SELECT 
                d.DNOCODIGO AS CODIGO_OFICINA,
                d.DNONOMBRE AS NOMBRE_OFICINA,
                d.DNOCCOSTO AS CODIGO_CCOSTO,
                c.CCONOMBRE AS NOMBRE_CCOSTO
            FROM 
                MANAGER.MNGDNO d
            LEFT JOIN 
                MANAGER.MNGCCO c ON d.DNOCCOSTO = c.CCOCODIGO
            WHERE 
                TRIM(d.DNOCODIGO) = TRIM(:codigo)
        """
        
        cursor.execute(query, {"codigo": codigo})
        row = cursor.fetchone()
        
        if row:
            return {
                "codigo_oficina": row[0],
                "nombre_oficina": row[1],
                "codigo_ccosto": row[2],
                "nombre_ccosto": row[3]
            }
        return None
        
    except oracledb.Error as e:
        print(f"Error executing query: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def get_all_oficinas() -> List[Dict[str, Any]]:
    """
    Retrieves all offices with their cost center information.
    
    Returns:
        List of dictionaries with office information
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        query = """
            SELECT 
                d.DNOCODIGO AS CODIGO_OFICINA,
                d.DNONOMBRE AS NOMBRE_OFICINA,
                d.DNOCCOSTO AS CODIGO_CCOSTO,
                c.CCONOMBRE AS NOMBRE_CCOSTO
            FROM 
                MANAGER.MNGDNO d
            LEFT JOIN 
                MANAGER.MNGCCO c ON d.DNOCCOSTO = c.CCOCODIGO
            ORDER BY d.DNOCODIGO
        """
        
        cursor.execute(query)
        rows = cursor.fetchall()
        
        return [
            {
                "codigo_oficina": row[0],
                "nombre_oficina": row[1],
                "codigo_ccosto": row[2],
                "nombre_ccosto": row[3]
            }
            for row in rows
        ]
        
    except oracledb.Error as e:
        print(f"Error executing query: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def get_proveedor_by_nit_oracle(nit: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves provider name from MANAGER.VINCULADO table by NIT (VINCEDULA).
    
    Args:
        nit: The provider's NIT number
    
    Returns:
        Dictionary with provider information or None if not found
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        query = """
            SELECT 
                TRIM(VINNOMBRE)
            FROM 
                MANAGER.VINCULADO
            WHERE 
                TRIM(VINCEDULA) = TRIM(:nit)
        """
        
        cursor.execute(query, {"nit": nit})
        row = cursor.fetchone()
        
        if row:
            return {
                "nit": nit,
                "nombre": row[0]
            }
        return None
        
    except oracledb.Error as e:
        print(f"Error executing query: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


def get_consecutivo_documento(tipo_documento: str, clase_documento: str = "0000") -> Optional[Dict[str, Any]]:
    """
    Retrieves the last used consecutive number for a document type from movements table.
    
    Args:
        tipo_documento: The document type code (e.g., 'DC07')
        clase_documento: The document class code (default: '0000') - not used in new query but kept for compatibility
    
    Returns:
        Dictionary with document consecutive information or None if not found
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        # Query to get the last used consecutive from movements table
        query = """
            SELECT 
                MAX(MCNNUMEDOC) AS ULTIMO_ASIENTO_MOV
            FROM 
                MANAGER.MNGMCN 
            WHERE 
                MCNTIPODOC = :tipo_documento
        """
        
        cursor.execute(query, {
            "tipo_documento": tipo_documento
        })
        row = cursor.fetchone()
        
        if row and row[0] is not None:
            return {
                "clase": clase_documento,
                "tipo": tipo_documento,
                "nombre_documento": f"Ultimo asiento movimiento {tipo_documento}",
                "consecutivo_actual": row[0]
            }
        return None
        
    except oracledb.Error as e:
        print(f"Error executing query: {e}")
        raise
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()
