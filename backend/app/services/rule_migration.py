import json
import logging
from pathlib import Path

from sqlalchemy import select
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.categorization_rule import CategorizationRule

logger = logging.getLogger(__name__)

RULES_JSON_PATH = (
    Path(__file__).resolve().parent.parent.parent / "categorisation_rules.json"
)


def _split_alternation(pattern: str) -> list[str]:
    """Split a regex pattern on top-level | (respects groups and character classes)."""
    parts: list[list[str]] = [[]]
    depth = 0
    in_class = False
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch == "\\":
            parts[-1].append(ch)
            if i + 1 < len(pattern):
                i += 1
                parts[-1].append(pattern[i])
        elif in_class:
            parts[-1].append(ch)
            if ch == "]":
                in_class = False
        elif ch == "[":
            parts[-1].append(ch)
            in_class = True
        elif ch == "(":
            parts[-1].append(ch)
            depth += 1
        elif ch == ")":
            parts[-1].append(ch)
            depth -= 1
        elif ch == "|" and depth == 0:
            parts.append([])
        else:
            parts[-1].append(ch)
        i += 1
    return ["".join(p) for p in parts if "".join(p).strip()]


async def migrate_rules_from_json(session: AsyncSession) -> dict:
    """Migrate categorisation_rules.json into the categorization_rules DB table.

    Returns a summary dict with counts and details of changes made.
    Only runs if the DB table is empty and the JSON file exists.
    """
    count_result = await session.execute(select(sa_func.count(CategorizationRule.id)))
    existing_count = count_result.scalar() or 0
    if existing_count > 0:
        return {"status": "skipped", "reason": "rules already exist in DB"}

    if not RULES_JSON_PATH.exists():
        return {"status": "skipped", "reason": "no JSON file found"}

    with open(RULES_JSON_PATH) as f:
        data = json.load(f)

    raw_rules = data.get("rules", [])

    # Process rules: split alternation, deduplicate, assign priority
    seen_patterns: set[str] = set()
    unique_rules: list[dict] = []
    duplicates_removed = 0
    alternations_split = 0

    for raw in raw_rules:
        pattern = raw["pattern"]
        category = raw["category"]
        sub_patterns = _split_alternation(pattern)

        if len(sub_patterns) > 1:
            alternations_split += 1

        for sub in sub_patterns:
            if not sub.strip():
                continue
            if sub in seen_patterns:
                duplicates_removed += 1
                continue
            seen_patterns.add(sub)
            unique_rules.append({"pattern": sub, "category": category})

    # Assign priority: first rule gets highest priority
    total = len(unique_rules)
    for i, rule in enumerate(unique_rules):
        priority = (total - i) * 10
        db_rule = CategorizationRule(
            pattern=rule["pattern"],
            category=rule["category"],
            priority=priority,
            enabled=True,
            match_count=0,
        )
        session.add(db_rule)

    await session.flush()

    summary = {
        "status": "migrated",
        "original_rule_count": len(raw_rules),
        "alternations_split": alternations_split,
        "duplicates_removed": duplicates_removed,
        "final_rule_count": total,
    }
    logger.info("Rules migration complete: %s", summary)
    return summary
