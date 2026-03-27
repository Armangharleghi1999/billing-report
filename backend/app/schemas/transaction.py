from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class TransactionOut(BaseModel):
    id: int
    statement_id: int
    date: date
    description: str
    merchant: str | None
    amount: Decimal
    currency: str
    category: str | None
    category_source: str
    is_credit: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionUpdate(BaseModel):
    category: str | None = None


class TransactionPreview(BaseModel):
    date: date
    description: str
    merchant: str | None = None
    amount: Decimal
    is_credit: bool = False
    category: str | None = None
    dedup_hash: str | None = None


class DuplicateItem(BaseModel):
    existing: TransactionOut
    incoming: TransactionPreview


class IngestResult(BaseModel):
    status: str  # "ok" | "pending_review"
    new_count: int
    duplicate_count: int
    new: list[TransactionPreview]
    duplicates: list[DuplicateItem]
    statement_id: int | None = None
    detected_source: str | None = None


class DuplicateResolution(BaseModel):
    dedup_hash: str
    action: str  # "skip" | "replace"


class ResolveRequest(BaseModel):
    statement_id: int
    resolutions: list[DuplicateResolution]


class BulkUpdateItem(BaseModel):
    id: int
    category: str
