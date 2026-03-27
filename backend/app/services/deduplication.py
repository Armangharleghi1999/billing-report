import hashlib
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction
from app.services.pdf_parser.base import ParsedTransaction


def compute_dedup_hash(txn_date: date, description: str, amount: Decimal) -> str:
    """SHA-256 of date|DESCRIPTION|amount — used to detect duplicates."""
    raw = f"{txn_date.isoformat()}|{description.strip().upper()}|{amount}"
    return hashlib.sha256(raw.encode()).hexdigest()


@dataclass
class DeduplicationResult:
    new: list[ParsedTransaction]
    duplicates: list[tuple[Transaction, ParsedTransaction]]


async def check_duplicates(
    session: AsyncSession,
    parsed: list[ParsedTransaction],
) -> DeduplicationResult:
    """Check a batch of parsed transactions against existing DB records.

    Returns new (safe to insert) and duplicate (need review) lists.
    """
    # Compute hashes for all incoming transactions
    hash_map: dict[str, ParsedTransaction] = {}
    for txn in parsed:
        h = compute_dedup_hash(txn.date, txn.description, txn.amount)
        hash_map[h] = txn

    # Batch query existing hashes
    existing_hashes = set()
    existing_map: dict[str, Transaction] = {}
    if hash_map:
        result = await session.execute(
            select(Transaction).where(Transaction.dedup_hash.in_(list(hash_map.keys())))
        )
        for existing_txn in result.scalars().all():
            if existing_txn.dedup_hash:
                existing_hashes.add(existing_txn.dedup_hash)
                existing_map[existing_txn.dedup_hash] = existing_txn

    new_txns: list[ParsedTransaction] = []
    dups: list[tuple[Transaction, ParsedTransaction]] = []

    for h, txn in hash_map.items():
        if h in existing_hashes:
            dups.append((existing_map[h], txn))
        else:
            new_txns.append(txn)

    return DeduplicationResult(new=new_txns, duplicates=dups)
