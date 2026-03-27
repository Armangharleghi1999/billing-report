from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionOut, TransactionUpdate, BulkUpdateItem
from app.services.categoriser import recategorise_all

router = APIRouter(prefix="/api/transactions", tags=["transactions"])

_SORT_COLUMNS = {
    "date": Transaction.date,
    "description": Transaction.description,
    "merchant": Transaction.merchant,
    "amount": Transaction.amount,
    "category": Transaction.category,
}


@router.get("", response_model=dict)
async def list_transactions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    category: str | None = None,
    source: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    search: str | None = None,
    sort_by: str = Query("date", description="Column to sort by"),
    sort_order: str = Query("desc", description="asc or desc"),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Paginated, filterable transaction list."""
    if sort_by not in _SORT_COLUMNS:
        raise HTTPException(422, f"Invalid sort_by. Allowed: {list(_SORT_COLUMNS)}")
    if sort_order not in ("asc", "desc"):
        raise HTTPException(422, "sort_order must be 'asc' or 'desc'")

    query = select(Transaction)
    count_query = select(func.count(Transaction.id))

    if category:
        query = query.where(Transaction.category == category)
        count_query = count_query.where(Transaction.category == category)
    if start_date:
        query = query.where(Transaction.date >= start_date)
        count_query = count_query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)
        count_query = count_query.where(Transaction.date <= end_date)
    if search:
        pattern = f"%{search}%"
        query = query.where(Transaction.description.ilike(pattern))
        count_query = count_query.where(Transaction.description.ilike(pattern))
    if source:
        from app.models.statement import Statement

        query = query.join(Statement).where(Statement.source == source)
        count_query = count_query.join(Statement).where(Statement.source == source)

    total = (await session.execute(count_query)).scalar() or 0

    sort_col = _SORT_COLUMNS[sort_by]
    order_expr = sort_col.asc() if sort_order == "asc" else sort_col.desc()
    # Secondary sort by id for stable pagination
    query = (
        query.order_by(order_expr, Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await session.execute(query)
    items = [TransactionOut.model_validate(t) for t in result.scalars().all()]

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size,
    }


@router.patch("/bulk", response_model=list[TransactionOut])
async def bulk_update_transactions(
    items: list[BulkUpdateItem],
    session: AsyncSession = Depends(get_session),
) -> list[TransactionOut]:
    """Bulk update multiple transaction categories."""
    updated = []
    for item in items:
        result = await session.execute(
            select(Transaction).where(Transaction.id == item.id)
        )
        txn = result.scalar_one_or_none()
        if txn:
            txn.category = item.category
            txn.category_source = "manual"
            updated.append(txn)
    if updated:
        await session.commit()
        for txn in updated:
            await session.refresh(txn)
    return [TransactionOut.model_validate(t) for t in updated]


@router.patch("/{txn_id}", response_model=TransactionOut)
async def update_transaction(
    txn_id: int,
    body: TransactionUpdate,
    session: AsyncSession = Depends(get_session),
) -> TransactionOut:
    """Update a transaction's category (manual override)."""
    result = await session.execute(select(Transaction).where(Transaction.id == txn_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, "Transaction not found.")

    if body.category is not None:
        txn.category = body.category
        txn.category_source = "manual"

    await session.commit()
    await session.refresh(txn)
    return TransactionOut.model_validate(txn)


@router.post("/recategorise", response_model=dict)
async def recategorise_transactions(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Re-run categorisation rules on all rule-categorised transactions."""
    updated = await recategorise_all(session)
    return {"updated": updated}


@router.delete("/{txn_id}")
async def delete_transaction(
    txn_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete a transaction."""
    result = await session.execute(select(Transaction).where(Transaction.id == txn_id))
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, "Transaction not found.")

    await session.delete(txn)
    await session.commit()
    return {"deleted": txn_id}
