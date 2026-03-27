import json
import re

from fastapi import APIRouter

from app.schemas.rules import ApplyRulesRequest, RulePreviewItem, RulePreviewResponse
from app.services.categoriser import RULES_PATH, _load_rules, reload_rules

router = APIRouter(prefix="/api/rules", tags=["rules"])


def _suggest_pattern(description: str) -> str:
    """Heuristic: first 2 meaningful uppercase words (3+ chars), ignoring numbers."""
    text = description.upper()
    text = re.sub(r"\b\d[\d\s]*\b", " ", text)
    words = re.findall(r"[A-Z]{3,}", text)
    if not words:
        return description[:20].upper().strip()
    return " ".join(words[:2])


@router.post("/preview", response_model=RulePreviewResponse)
async def preview_rule_changes(body: dict) -> RulePreviewResponse:
    """Given a list of {description, new_category}, return suggested rule patches."""
    rules, _ = _load_rules()
    changes = body.get("changes", [])
    items = []

    for change in changes:
        desc = change["description"]
        new_cat = change["new_category"]
        suggested = _suggest_pattern(desc)

        text = desc.upper()
        existing_idx: int | None = None
        existing_pattern: str | None = None
        existing_cat: str | None = None
        for i, rule in enumerate(rules):
            if rule["_compiled"].search(text):
                existing_idx = i
                existing_pattern = rule["pattern"]
                existing_cat = rule["category"]
                break

        items.append(
            RulePreviewItem(
                description=desc,
                new_category=new_cat,
                suggested_pattern=suggested,
                existing_rule_index=existing_idx,
                existing_rule_pattern=existing_pattern,
                existing_rule_category=existing_cat,
            )
        )

    return RulePreviewResponse(items=items)


@router.post("/apply")
async def apply_rule_changes(body: ApplyRulesRequest) -> dict:
    """Apply rule patches to categorisation_rules.json and reload rules."""
    with open(RULES_PATH) as f:
        data = json.load(f)

    rules: list[dict] = data["rules"]

    # Update existing rules in-place first (no index shift)
    for patch in body.patches:
        if patch.existing_rule_index is not None:
            rules[patch.existing_rule_index]["category"] = patch.category

    # Prepend brand-new rules
    new_rules = [
        {"pattern": p.pattern, "category": p.category}
        for p in body.patches
        if p.existing_rule_index is None
    ]
    rules = new_rules + rules

    data["rules"] = rules
    with open(RULES_PATH, "w") as f:
        json.dump(data, f, indent=2)

    reload_rules()
    return {"applied": len(body.patches)}
