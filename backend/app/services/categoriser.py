import re
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.categorization_rule import CategorizationRule
from app.models.transaction import Transaction

DEFAULT_CATEGORY = "Other"

_rules_cache: list[dict] | None = None


async def load_rules(session: AsyncSession) -> None:
    """Load all enabled rules from DB into in-memory cache, ordered by priority DESC."""
    global _rules_cache
    result = await session.execute(
        select(CategorizationRule)
        .where(CategorizationRule.enabled == True)
        .order_by(CategorizationRule.priority.desc(), CategorizationRule.id.asc())
    )
    rules = result.scalars().all()
    _rules_cache = [
        {
            "id": r.id,
            "pattern": r.pattern,
            "category": r.category,
            "_compiled": re.compile(r.pattern, re.IGNORECASE),
        }
        for r in rules
    ]


def categorise(description: str) -> tuple[str, int | None]:
    """Return (category, rule_id) for a transaction description.

    Uses the in-memory cache. Returns (DEFAULT_CATEGORY, None) if no rule matches
    or if the cache hasn't been loaded yet.
    """
    if _rules_cache is None:
        return DEFAULT_CATEGORY, None
    text = description.upper()
    for rule in _rules_cache:
        if rule["_compiled"].search(text):
            return rule["category"], rule["id"]
    return DEFAULT_CATEGORY, None


async def reload_rules(session: AsyncSession) -> None:
    """Force reload of rules from DB into memory."""
    await load_rules(session)


async def update_match_stats(session: AsyncSession, rule_ids: list[int]) -> None:
    """Batch-update match_count and last_matched_at for the given rule IDs."""
    if not rule_ids:
        return
    counts: dict[int, int] = {}
    for rid in rule_ids:
        counts[rid] = counts.get(rid, 0) + 1
    now = datetime.now()
    for rid, count in counts.items():
        await session.execute(
            update(CategorizationRule)
            .where(CategorizationRule.id == rid)
            .values(
                match_count=CategorizationRule.match_count + count,
                last_matched_at=now,
            )
        )


async def recategorise_all(session: AsyncSession) -> int:
    """Re-run rules on all transactions with category_source='rule'.

    Returns the number of updated rows.
    """
    await reload_rules(session)

    # Scan all transactions for match counting so manually-tagged transactions
    # contribute to match_count. Category updates are restricted to rule-sourced rows
    # to preserve manual overrides.
    result = await session.execute(select(Transaction))
    transactions = result.scalars().all()

    count = 0
    matched_rule_ids: list[int] = []
    for txn in transactions:
        new_cat, rule_id = categorise(txn.description)
        if rule_id is not None:
            matched_rule_ids.append(rule_id)
        if txn.category_source == "rule" and new_cat != txn.category:
            txn.category = new_cat
            count += 1

    await update_match_stats(session, matched_rule_ids)

    if count or matched_rule_ids:
        await session.commit()

    return count
