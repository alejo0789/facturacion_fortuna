"""
Feedback router - Knowledge Base for Agent
Allows users to provide feedback about processed invoices.
The N8N agent can query this before processing new invoices.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from database import get_db
import crud
import schemas

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/", response_model=schemas.ProveedorFeedback)
async def create_feedback(
    feedback: schemas.ProveedorFeedbackCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Create feedback for a provider.
    Used by users to report issues with processed invoices.
    """
    return await crud.create_proveedor_feedback(db, feedback)


@router.get("/proveedor/{nit}", response_model=List[schemas.ProveedorFeedback])
async def get_feedback_by_nit(
    nit: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all feedback for a provider by NIT.
    This is the endpoint the N8N agent should call before processing invoices.
    Returns feedback ordered by date (most recent first).
    """
    return await crud.get_feedback_by_proveedor_nit(db, nit, limit)


@router.get("/factura/{factura_id}", response_model=List[schemas.ProveedorFeedback])
async def get_feedback_by_factura(
    factura_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all feedback for a specific invoice.
    """
    return await crud.get_feedback_by_factura(db, factura_id)


@router.get("/", response_model=List[schemas.ProveedorFeedback])
async def get_all_feedback(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """
    Get all feedback entries.
    """
    return await crud.get_all_feedback(db, skip, limit)
