"""
Oracle Offices Router
Endpoints for querying offices from Oracle MANAMED database
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import oracledb

import sys
sys.path.append('..')
from oracle_database import get_oficina_by_codigo, get_all_oficinas, get_oracle_connection, get_consecutivo_documento

router = APIRouter()


class OficinaOracle(BaseModel):
    """Schema for office information from Oracle"""
    codigo_oficina: str
    nombre_oficina: Optional[str] = None
    codigo_ccosto: Optional[str] = None
    nombre_ccosto: Optional[str] = None


class OficinaOracleResponse(BaseModel):
    """Response schema for single office"""
    success: bool
    data: Optional[OficinaOracle] = None
    message: Optional[str] = None


class OficinasOracleListResponse(BaseModel):
    """Response schema for list of offices"""
    success: bool
    data: List[OficinaOracle] = []
    total: int = 0
    message: Optional[str] = None


# ============== ENDPOINTS DE DIAGNÓSTICO ==============

@router.get("/oracle-test-connection")
async def test_oracle_connection():
    """
    Test Oracle database connection and return diagnostic info.
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        # Test básico de conexión
        cursor.execute("SELECT 1 FROM DUAL")
        result = cursor.fetchone()
        
        # Obtener información del usuario actual
        cursor.execute("SELECT USER FROM DUAL")
        current_user = cursor.fetchone()[0]
        
        # Obtener la base de datos
        cursor.execute("SELECT SYS_CONTEXT('USERENV', 'DB_NAME') FROM DUAL")
        db_name = cursor.fetchone()[0]
        
        return {
            "success": True,
            "message": "Conexión exitosa a Oracle",
            "current_user": current_user,
            "database": db_name,
            "test_query_result": result[0]
        }
        
    except oracledb.Error as e:
        return {
            "success": False,
            "message": f"Error de conexión: {str(e)}"
        }
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@router.get("/oracle-list-schemas")
async def list_oracle_schemas():
    """
    List all schemas/users accessible to the current user.
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        # Listar esquemas que el usuario puede ver
        cursor.execute("""
            SELECT DISTINCT OWNER 
            FROM ALL_TABLES 
            ORDER BY OWNER
        """)
        schemas = [row[0] for row in cursor.fetchall()]
        
        return {
            "success": True,
            "schemas": schemas,
            "total": len(schemas)
        }
        
    except oracledb.Error as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@router.get("/oracle-list-tables")
async def list_oracle_tables(schema: Optional[str] = None):
    """
    List tables accessible to the current user.
    Optionally filter by schema.
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        if schema:
            # Buscar tablas en un esquema específico
            cursor.execute("""
                SELECT OWNER, TABLE_NAME 
                FROM ALL_TABLES 
                WHERE OWNER = :schema
                ORDER BY TABLE_NAME
            """, {"schema": schema.upper()})
        else:
            # Buscar tablas que contengan MNG en el nombre (para encontrar MNGDNO y MNGCCO)
            cursor.execute("""
                SELECT OWNER, TABLE_NAME 
                FROM ALL_TABLES 
                WHERE TABLE_NAME LIKE '%MNG%' OR TABLE_NAME LIKE '%DNO%' OR TABLE_NAME LIKE '%CCO%'
                ORDER BY OWNER, TABLE_NAME
            """)
        
        tables = [{"owner": row[0], "table_name": row[1]} for row in cursor.fetchall()]
        
        return {
            "success": True,
            "tables": tables,
            "total": len(tables),
            "hint": "Si no ves las tablas MNGDNO y MNGCCO, probablemente están en otro esquema. Usa el parámetro ?schema=NOMBRE_ESQUEMA"
        }
        
    except oracledb.Error as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@router.get("/oracle-search-table/{table_name}")
async def search_oracle_table(table_name: str):
    """
    Search for a specific table across all accessible schemas.
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        cursor.execute("""
            SELECT OWNER, TABLE_NAME 
            FROM ALL_TABLES 
            WHERE TABLE_NAME LIKE :table_name
            ORDER BY OWNER
        """, {"table_name": f"%{table_name.upper()}%"})
        
        tables = [{"owner": row[0], "table_name": row[1]} for row in cursor.fetchall()]
        
        return {
            "success": True,
            "search_term": table_name,
            "tables_found": tables,
            "total": len(tables)
        }
        
    except oracledb.Error as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


@router.get("/oracle-debug-oficina/{codigo}")
async def debug_oficina_search(codigo: str):
    """
    Debug endpoint to understand why a code might not be found.
    Shows exact comparison results.
    """
    connection = None
    cursor = None
    try:
        connection = get_oracle_connection()
        cursor = connection.cursor()
        
        # Primero, ver las primeras 10 oficinas para entender el formato
        cursor.execute("""
            SELECT 
                d.DNOCODIGO,
                LENGTH(d.DNOCODIGO) as LEN,
                DUMP(d.DNOCODIGO) as DUMP_VAL
            FROM MANAGER.MNGDNO d
            WHERE ROWNUM <= 10
            ORDER BY d.DNOCODIGO
        """)
        sample_rows = cursor.fetchall()
        samples = [{"codigo": row[0], "length": row[1], "dump": row[2]} for row in sample_rows]
        
        # Buscar con diferentes métodos
        results = {}
        
        # Método 1: Comparación exacta
        cursor.execute("""
            SELECT COUNT(*) FROM MANAGER.MNGDNO WHERE DNOCODIGO = :codigo
        """, {"codigo": codigo})
        results["exact_match"] = cursor.fetchone()[0]
        
        # Método 2: Con TRIM
        cursor.execute("""
            SELECT COUNT(*) FROM MANAGER.MNGDNO WHERE TRIM(DNOCODIGO) = TRIM(:codigo)
        """, {"codigo": codigo})
        results["trim_match"] = cursor.fetchone()[0]
        
        # Método 3: Con LIKE
        cursor.execute("""
            SELECT COUNT(*) FROM MANAGER.MNGDNO WHERE DNOCODIGO LIKE :codigo
        """, {"codigo": f"%{codigo}%"})
        results["like_match"] = cursor.fetchone()[0]
        
        # Método 4: Buscar si existe el código que buscamos
        cursor.execute("""
            SELECT DNOCODIGO, DNONOMBRE FROM MANAGER.MNGDNO 
            WHERE DNOCODIGO LIKE :codigo
        """, {"codigo": f"%{codigo}%"})
        found_rows = cursor.fetchall()
        found = [{"codigo": row[0], "nombre": row[1]} for row in found_rows]
        
        return {
            "success": True,
            "search_code": codigo,
            "search_code_length": len(codigo),
            "sample_codes_from_table": samples,
            "match_results": results,
            "found_with_like": found
        }
        
    except oracledb.Error as e:
        return {
            "success": False,
            "message": f"Error: {str(e)}"
        }
    finally:
        if cursor:
            cursor.close()
        if connection:
            connection.close()


# ============== ENDPOINTS PRINCIPALES ==============

@router.get("/oficinas-oracle/{codigo}", response_model=OficinaOracleResponse)
async def get_oficina_oracle(codigo: str):
    """
    Get office information from Oracle database by code.
    
    Args:
        codigo: Office code (DNOCODIGO) to search for
    
    Returns:
        Office information including name and cost center details
    """
    try:
        result = get_oficina_by_codigo(codigo)
        
        if result:
            return OficinaOracleResponse(
                success=True,
                data=OficinaOracle(**result),
                message="Oficina encontrada"
            )
        else:
            return OficinaOracleResponse(
                success=False,
                data=None,
                message=f"No se encontró oficina con código: {codigo}"
            )
            
    except oracledb.Error as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error de conexión con Oracle: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error interno: {str(e)}"
        )


@router.get("/oficinas-oracle", response_model=OficinasOracleListResponse)
async def get_all_oficinas_oracle():
    """
    Get all offices from Oracle database.
    
    Returns:
        List of all offices with their cost center information
    """
    try:
        results = get_all_oficinas()
        
        return OficinasOracleListResponse(
            success=True,
            data=[OficinaOracle(**r) for r in results],
            total=len(results),
            message=f"Se encontraron {len(results)} oficinas"
        )
            
    except oracledb.Error as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error de conexión con Oracle: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error interno: {str(e)}"
        )


# ============== ENDPOINT CONSECUTIVO DOCUMENTO ==============

class ConsecutivoDocumento(BaseModel):
    """Schema for document consecutive information"""
    clase: Optional[str] = None
    tipo: Optional[str] = None
    nombre_documento: Optional[str] = None
    consecutivo_actual: Optional[int] = None


class ConsecutivoDocumentoResponse(BaseModel):
    """Response schema for document consecutive"""
    success: bool
    data: Optional[ConsecutivoDocumento] = None
    message: Optional[str] = None


@router.get("/consecutivo-documento/{tipo_documento}", response_model=ConsecutivoDocumentoResponse)
async def get_consecutivo_doc(tipo_documento: str, clase_documento: str = "0000"):
    """
    Get the current consecutive number for a document type from Oracle.
    
    Args:
        tipo_documento: Document type code (e.g., 'DC07')
        clase_documento: Document class code (default: '0000')
    
    Returns:
        Document consecutive information including the current number
    
    Example:
        GET /api/consecutivo-documento/DC07
        GET /api/consecutivo-documento/DC07?clase_documento=0000
    """
    try:
        result = get_consecutivo_documento(tipo_documento, clase_documento)
        
        if result:
            return ConsecutivoDocumentoResponse(
                success=True,
                data=ConsecutivoDocumento(**result),
                message=f"Consecutivo encontrado para documento {tipo_documento}"
            )
        else:
            return ConsecutivoDocumentoResponse(
                success=False,
                data=None,
                message=f"No se encontró documento con tipo: {tipo_documento} y clase: {clase_documento}"
            )
            
    except oracledb.Error as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error de conexión con Oracle: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error interno: {str(e)}"
        )
