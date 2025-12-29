from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
import schemas, crud
from database import get_db

router = APIRouter()

@router.post("/pagos/", response_model=schemas.Pago)
async def create_pago(pago: schemas.PagoCreate, db: AsyncSession = Depends(get_db)):
    # Verify contract exists
    db_contrato = await crud.get_contrato(db, contrato_id=pago.contrato_id)
    if not db_contrato:
        raise HTTPException(status_code=404, detail="Contrato not found")
    
    return await crud.create_pago(db, pago)

@router.get("/pagos/contrato/{contrato_id}", response_model=List[schemas.Pago])
async def read_pagos(contrato_id: int, db: AsyncSession = Depends(get_db)):
    return await crud.get_pagos_by_contrato(db, contrato_id)
