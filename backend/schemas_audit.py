"""Pydantic schemas para el audit log."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class AuditLogEntry(BaseModel):
    id: int
    ts: datetime
    empresa_id: Optional[int] = None
    user_id: Optional[int] = None
    user_email: Optional[str] = None    # populado por join si el user existe
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    result: str = "success"
    details: Optional[dict[str, Any]] = None

    class Config:
        from_attributes = True


class AuditLogPage(BaseModel):
    items: list[AuditLogEntry]
    total: int
    page: int
    page_size: int
