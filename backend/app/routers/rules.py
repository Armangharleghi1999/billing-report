import re

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.categorization_rule import CategorizationRule
from app.schemas.rules import ApplyRulesRequest, RulePreviewItem, RulePreviewResponse
from app.services.categoriser import reload_rules

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
async def preview_rule_changes(
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> RulePreviewResponse:
    """Given a list of {description, new_category}, return suggested rule patches."""
    result = await session.execute(
        select(CategorizationRule)
        .where(CategorizationRule.enabled == True)
        .order_by(CategorizationRule.priority.desc(), CategorizationRule.id.asc())
    )
    rules = result.scalars().all()
    compiled = [(r, re.compile(r.pattern, re.IGNORECASE)) for r in rules]

    changes = body.get("changes", [])
    items = []

    for change in changes:
        desc = change["description"]
        new_cat = change["new_category"]
        suggested = _suggest_pattern(desc)

        text = desc.upper()
        existing_id: int | None = None
        existing_pattern: str | None = None
        existing_cat: str | None = None
        for rule, regex in compiled:
            if regex.search(text):
                existing_id = rule.id
                existing_pattern = rule.pattern
                existing_cat = rule.category
                break

        items.append(
            RulePreviewItem(
                description=desc,
                new_category=new_cat,
                suggested_pattern=suggested,
                existing_rule_id=existing_id,
                existing_rule_pattern=existing_pattern,
                existing_rule_category=existing_cat,
            )
        )

    return RulePreviewResponse(items=items)


@router.post("/apply")
async def apply_rule_changes(
    body: ApplyRulesRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Apply rule patches: update existing rules or create new ones in the DB."""
    # Find current max priority for new rules
    max_prio_result = await session.execute(
        select(sa_func.max(CategorizationRule.priority))
    )
    max_priority = max_prio_result.scalar() or 0

    for patch in body.patches:
        if patch.existing_rule_id is not None:
            result = await session.execute(
                select(CategorizationRule).where(
                    CategorizationRule.id == patch.existing_rule_id
                )
            )
            rule = result.scalar_one_or_none()
            if rule:
                rule.category = patch.category
        else:
            max_priority += 10
            new_rule = CategorizationRule(
                pattern=patch.pattern,
                category=patch.category,
                priority=max_priority,
                enabled=True,
            )
            session.add(new_rule)

    await session.commit()
    await reload_rules(session)
    return {"applied": len(body.patches)}
