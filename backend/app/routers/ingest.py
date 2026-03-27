import hashlib
import io

import pdfplumber
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.statement import Statement
from app.models.transaction import Transaction
from app.schemas.statement import StatementOut
from app.schemas.transaction import (
    DuplicateItem,
    IngestResult,
    ResolveRequest,
    TransactionOut,
    TransactionPreview,
)
from app.services.categoriser import categorise
from app.services.deduplication import check_duplicates, compute_dedup_hash
from app.services.pdf_parser.amex import AmexParser
from app.services.pdf_parser.chase import ChaseParser


def _detect_source(pdf_bytes: bytes) -> str:
    """Auto-detect statement source (amex/chase) from PDF text content."""
    text = ""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:3]:
            text += (page.extract_text() or "").upper()

    if "AMERICAN EXPRESS" in text or "AMEXBANK" in text:
        return "amex"
    if "CHASE" in text or "JPMORGAN" in text:
        return "chase"
    raise HTTPException(
        422,
        "Could not detect statement source. Ensure the PDF is an AMEX or Chase statement.",
    )


router = APIRouter(prefix="/api/ingest", tags=["ingest"])


@router.post("/statement", response_model=IngestResult)
async def ingest_statement(
    file: UploadFile = File(...),
    source: str | None = Form(default=None),
    session: AsyncSession = Depends(get_session),
) -> IngestResult:
    """Upload a PDF bank statement (AMEX or Chase), parse it, check for duplicates.

    The `source` field is optional — if omitted, the source is auto-detected from the PDF.
    """
    pdf_bytes = await file.read()

    if source:
        if source not in ("amex", "chase"):
            raise HTTPException(
                400, f"Unsupported source: {source}. Use 'amex' or 'chase'."
            )
    else:
        source = _detect_source(pdf_bytes)

    file_hash = hashlib.sha256(pdf_bytes).hexdigest()

    # Check for duplicate file import
    existing = await session.execute(
        select(Statement).where(Statement.file_hash == file_hash)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "This PDF has already been imported.")

    # Parse
    parser = AmexParser() if source == "amex" else ChaseParser()
    parsed_txns = parser.parse(pdf_bytes)
    period_start, period_end = parser.detect_period(pdf_bytes)

    if not parsed_txns:
        raise HTTPException(422, "No transactions found in the PDF.")

    # Create statement record
    stmt = Statement(
        source=source,
        filename=file.filename or "unknown.pdf",
        period_start=period_start,
        period_end=period_end,
        file_hash=file_hash,
    )
    session.add(stmt)
    await session.flush()  # get stmt.id

    # Deduplication
    dedup_result = await check_duplicates(session, parsed_txns)

    # Insert new (non-duplicate) transactions
    for txn in dedup_result.new:
        category = categorise(txn.description)
        db_txn = Transaction(
            statement_id=stmt.id,
            date=txn.date,
            description=txn.description,
            merchant=txn.merchant,
            amount=txn.amount,
            is_credit=txn.is_credit,
            category=category,
            category_source="rule",
            dedup_hash=compute_dedup_hash(txn.date, txn.description, txn.amount),
        )
        session.add(db_txn)

    await session.commit()

    # Build response
    new_previews = [
        TransactionPreview(
            date=t.date,
            description=t.description,
            merchant=t.merchant,
            amount=t.amount,
            is_credit=t.is_credit,
            category=categorise(t.description),
            dedup_hash=compute_dedup_hash(t.date, t.description, t.amount),
        )
        for t in dedup_result.new
    ]

    dup_items = [
        DuplicateItem(
            existing=TransactionOut.model_validate(existing_txn),
            incoming=TransactionPreview(
                date=incoming.date,
                description=incoming.description,
                merchant=incoming.merchant,
                amount=incoming.amount,
                is_credit=incoming.is_credit,
                category=categorise(incoming.description),
                dedup_hash=compute_dedup_hash(
                    incoming.date, incoming.description, incoming.amount
                ),
            ),
        )
        for existing_txn, incoming in dedup_result.duplicates
    ]

    status = "pending_review" if dup_items else "ok"
    return IngestResult(
        status=status,
        new_count=len(new_previews),
        duplicate_count=len(dup_items),
        new=new_previews,
        duplicates=dup_items,
        statement_id=stmt.id,
        detected_source=source,
    )


@router.post("/resolve-duplicates")
async def resolve_duplicates(
    body: ResolveRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Resolve pending duplicate decisions (skip or replace)."""
    replaced = 0
    skipped = 0

    for resolution in body.resolutions:
        if resolution.action == "skip":
            skipped += 1
            continue

        if resolution.action == "replace":
            # Delete the existing transaction and we'd re-insert from the statement
            result = await session.execute(
                select(Transaction).where(
                    Transaction.dedup_hash == resolution.dedup_hash
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                await session.delete(existing)
                replaced += 1

    await session.commit()
    return {"replaced": replaced, "skipped": skipped}


@router.get("/history", response_model=list[StatementOut])
async def import_history(
    session: AsyncSession = Depends(get_session),
) -> list[StatementOut]:
    """List all imported statements."""
    result = await session.execute(
        select(Statement).order_by(Statement.imported_at.desc())
    )
    return [StatementOut.model_validate(s) for s in result.scalars().all()]


@router.delete("/clear-all")
async def clear_all_data(
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Delete all statements and transactions from the database."""
    result = await session.execute(select(Statement))
    statements = result.scalars().all()
    for stmt in statements:
        await session.delete(stmt)
    await session.commit()
    return {"deleted_statements": len(statements)}
