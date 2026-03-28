#!/usr/bin/env python3
"""Migrate manually recategorised transactions into categorisation_rules.json.

Run from the project root:
    python backend/migrate_manual_rules.py
"""

import asyncio
import json
import re
import sys
from pathlib import Path

# Allow imports from backend/
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import select

from app.database import async_session
from app.models.transaction import Transaction
from app.services.categoriser import RULES_PATH


def _suggest_pattern(description: str) -> str:
    text = description.upper()
    text = re.sub(r"\b\d[\d\s]*\b", " ", text)
    words = re.findall(r"[A-Z]{3,}", text)
    if not words:
        return description[:20].upper().strip()
    return " ".join(words[:2])


def _find_matching_rule(description: str, rules: list[dict]) -> int | None:
    text = description.upper()
    for i, rule in enumerate(rules):
        if re.search(rule["pattern"], text, re.IGNORECASE):
            return i
    return None


async def main() -> None:
    with open(RULES_PATH) as f:
        data = json.load(f)
    rules: list[dict] = data["rules"]

    async with async_session() as session:
        result = await session.execute(
            select(Transaction).where(Transaction.category_source == "manual")
        )
        manual_txns = result.scalars().all()

    if not manual_txns:
        print("No manually categorised transactions found.")
        return

    print(f"Found {len(manual_txns)} manually categorised transaction(s).\n")

    # Collect (existing_idx_or_None, pattern, new_category) tuples
    queued: list[tuple[int | None, str, str]] = []

    for txn in manual_txns:
        suggested = _suggest_pattern(txn.description)
        existing_idx = _find_matching_rule(txn.description, rules)
        existing = rules[existing_idx] if existing_idx is not None else None

        print(f"Description : {txn.description[:80]}")
        print(f"Category    : {txn.category}")

        if existing:
            print(
                f"Matched rule: [{existing_idx}] pattern='{existing['pattern']}'"
                f" → '{existing['category']}'"
            )
            if existing["category"] == txn.category:
                print("  → Rule already correct. Skipping.\n")
                continue
            resp = (
                input(
                    f"  Update rule [{existing_idx}] to '{txn.category}'? [Y/n/s(skip)]: "
                )
                .strip()
                .lower()
            )
            if resp in ("n", "s"):
                print("  Skipped.\n")
                continue
            queued.append((existing_idx, existing["pattern"], txn.category))
            print(f"  Queued: UPDATE rule [{existing_idx}] → '{txn.category}'\n")
        else:
            print(f"  No existing rule. Suggested pattern: '{suggested}'")
            resp = input(
                "  Press Enter to accept, type a custom pattern, or 's' to skip: "
            ).strip()
            if resp.lower() == "s":
                print("  Skipped.\n")
                continue
            pattern = resp if resp else suggested
            queued.append((None, pattern, txn.category))
            print(f"  Queued: ADD rule '{pattern}' → '{txn.category}'\n")

    if not queued:
        print("Nothing to apply.")
        return

    print(f"\n{'='*60}")
    print(f"About to apply {len(queued)} change(s):")
    for idx, pattern, cat in queued:
        if idx is not None:
            print(
                f"  UPDATE [{idx}] '{rules[idx]['pattern']}': "
                f"'{rules[idx]['category']}' → '{cat}'"
            )
        else:
            print(f"  ADD    '{pattern}' → '{cat}'")

    confirm = input("\nApply all? [Y/n]: ").strip().lower()
    if confirm not in ("", "y"):
        print("Aborted.")
        return

    # Apply updates in-place first
    for idx, pattern, cat in queued:
        if idx is not None:
            rules[idx]["category"] = cat

    # Prepend new rules
    new_rules = [{"pattern": p, "category": c} for idx, p, c in queued if idx is None]
    rules = new_rules + rules
    data["rules"] = rules

    with open(RULES_PATH, "w") as f:
        json.dump(data, f, indent=2)

    print(f"\nDone. {len(queued)} rule(s) applied to {RULES_PATH}.")
    print(
        "Run `curl -X POST http://localhost:8080/api/transactions/recategorise` to apply rules to existing transactions."
    )


if __name__ == "__main__":
    asyncio.run(main())
