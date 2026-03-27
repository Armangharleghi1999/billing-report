import json
import re
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.transaction import Transaction

_rules: list[dict] | None = None
_default_category: str = "Other"

RULES_PATH = Path(__file__).resolve().parent.parent.parent / "categorisation_rules.json"


def _load_rules() -> tuple[list[dict], str]:
    global _rules, _default_category
    if _rules is not None:
        return _rules, _default_category

    with open(RULES_PATH) as f:
        data = json.load(f)

    _rules = data.get("rules", [])
    _default_category = data.get("default_category", "Other")

    # Pre-compile regex patterns
    for rule in _rules:
        rule["_compiled"] = re.compile(rule["pattern"], re.IGNORECASE)

    return _rules, _default_category


def reload_rules() -> None:
    """Force reload of categorisation rules from disk."""
    global _rules
    _rules = None
    _load_rules()


def categorise(description: str) -> str:
    """Return the best-matching category for a transaction description."""
    rules, default = _load_rules()
    text = description.upper()
    for rule in rules:
        if rule["_compiled"].search(text):
            return rule["category"]
    return default


async def recategorise_all(session: AsyncSession) -> int:
    """Re-run rules on all transactions with category_source='rule'.

    Returns the number of updated rows.
    """
    reload_rules()

    result = await session.execute(
        select(Transaction).where(Transaction.category_source == "rule")
    )
    transactions = result.scalars().all()

    count = 0
    for txn in transactions:
        new_cat = categorise(txn.description)
        if new_cat != txn.category:
            txn.category = new_cat
            count += 1

    if count:
        await session.commit()

    return count
