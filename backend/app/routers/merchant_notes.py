from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.merchant_note import MerchantNote

router = APIRouter(prefix="/api/merchant-notes", tags=["merchant-notes"])


class MerchantNoteItem(BaseModel):
    merchant: str
    note: str


@router.get("", response_model=dict[str, str])
async def get_merchant_notes(
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    result = await session.execute(select(MerchantNote))
    return {row.merchant: row.note for row in result.scalars().all()}


@router.post("/bulk", response_model=list[MerchantNoteItem])
async def bulk_upsert_merchant_notes(
    items: list[MerchantNoteItem],
    session: AsyncSession = Depends(get_session),
) -> list[MerchantNoteItem]:
    for item in items:
        existing = await session.get(MerchantNote, item.merchant)
        if existing:
            existing.note = item.note
        else:
            session.add(MerchantNote(merchant=item.merchant, note=item.note))
    await session.commit()
    return items
