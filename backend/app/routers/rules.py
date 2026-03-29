import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete, select, update
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.models.categorization_rule import CategorizationRule
from app.models.transaction import Transaction
from app.schemas.rules import (
    ApplyRulesRequest,
    BulkDeleteRequest,
    BulkToggleRequest,
    PaginatedRules,
    RuleCreate,
    RuleOut,
    RulePreviewItem,
    RulePreviewResponse,
    RuleStatsOut,
    RuleUpdate,
    TestPatternRequest,
    TestPatternResponse,
)
from app.services.categoriser import categorise, reload_rules, update_match_stats

router = APIRouter(prefix="/api/rules", tags=["rules"])

_SORT_COLUMNS = {
    "priority": CategorizationRule.priority,
    "pattern": CategorizationRule.pattern,
    "category": CategorizationRule.category,
    "match_count": CategorizationRule.match_count,
    "last_matched_at": CategorizationRule.last_matched_at,
    "created_at": CategorizationRule.created_at,
    "updated_at": CategorizationRule.updated_at,
}


def _suggest_pattern(description: str) -> str:
    """Heuristic: first 2 meaningful uppercase words (3+ chars), ignoring numbers."""
    text = description.upper()
    text = re.sub(r"\b\d[\d\s]*\b", " ", text)
    words = re.findall(r"[A-Z]{3,}", text)
    if not words:
        return description[:20].upper().strip()
    return " ".join(words[:2])


@router.get("", response_model=PaginatedRules)
async def list_rules(
    category: str | None = Query(None),
    enabled: bool | None = Query(None),
    search: str | None = Query(None),
    unused_only: bool = Query(False),
    sort_by: str = Query("priority"),
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
) -> PaginatedRules:
    if sort_by not in _SORT_COLUMNS:
        raise HTTPException(422, f"Invalid sort_by. Allowed: {list(_SORT_COLUMNS)}")
    if sort_order not in ("asc", "desc"):
        raise HTTPException(422, "sort_order must be 'asc' or 'desc'")

    stmt = select(CategorizationRule)
    if category is not None:
        stmt = stmt.where(CategorizationRule.category == category)
    if enabled is not None:
        stmt = stmt.where(CategorizationRule.enabled == enabled)
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            CategorizationRule.pattern.ilike(like)
            | CategorizationRule.category.ilike(like)
        )
    if unused_only:
        stmt = stmt.where(CategorizationRule.match_count == 0)

    count_result = await session.execute(
        select(sa_func.count()).select_from(stmt.subquery())
    )
    total = count_result.scalar() or 0

    col = _SORT_COLUMNS[sort_by]
    order_expr = col.desc() if sort_order == "desc" else col.asc()
    stmt = (
        stmt.order_by(order_expr, CategorizationRule.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )

    result = await session.execute(stmt)
    items = [RuleOut.model_validate(r) for r in result.scalars().all()]

    return PaginatedRules(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/stats", response_model=RuleStatsOut)
async def get_rule_stats(session: AsyncSession = Depends(get_session)) -> RuleStatsOut:
    total_enabled = (
        await session.execute(
            select(sa_func.count(CategorizationRule.id)).where(
                CategorizationRule.enabled == True
            )  # noqa: E712
        )
    ).scalar() or 0

    categories_covered = (
        await session.execute(
            select(sa_func.count(sa_func.distinct(CategorizationRule.category))).where(
                CategorizationRule.enabled == True  # noqa: E712
            )
        )
    ).scalar() or 0

    unused_count = (
        await session.execute(
            select(sa_func.count(CategorizationRule.id)).where(
                CategorizationRule.match_count == 0
            )
        )
    ).scalar() or 0

    last_updated = (
        await session.execute(select(sa_func.max(CategorizationRule.updated_at)))
    ).scalar()

    return RuleStatsOut(
        total_enabled=total_enabled,
        categories_covered=categories_covered,
        unused_count=unused_count,
        last_updated=last_updated,
    )


@router.post("", response_model=RuleOut, status_code=201)
async def create_rule(
    body: RuleCreate,
    session: AsyncSession = Depends(get_session),
) -> RuleOut:
    priority = body.priority
    if priority is None:
        max_result = await session.execute(
            select(sa_func.max(CategorizationRule.priority))
        )
        priority = (max_result.scalar() or 0) + 10

    rule = CategorizationRule(
        pattern=body.pattern,
        category=body.category,
        priority=priority,
        enabled=body.enabled,
    )
    session.add(rule)
    await session.commit()
    await session.refresh(rule)
    await reload_rules(session)
    return RuleOut.model_validate(rule)


@router.post("/test-pattern", response_model=TestPatternResponse)
async def test_pattern_endpoint(
    body: TestPatternRequest,
    session: AsyncSession = Depends(get_session),
) -> TestPatternResponse:
    try:
        compiled = re.compile(body.pattern, re.IGNORECASE)
    except re.error as exc:
        raise HTTPException(status_code=422, detail=f"Invalid regex: {exc}")

    result = await session.execute(select(Transaction.description))
    descriptions = result.scalars().all()
    matches = [d for d in descriptions if compiled.search(d)]
    return TestPatternResponse(matches=matches[:10], count=len(matches))


@router.post("/bulk-delete")
async def bulk_delete_rules(
    body: BulkDeleteRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not body.ids:
        return {"deleted": 0}
    await session.execute(
        delete(CategorizationRule).where(CategorizationRule.id.in_(body.ids))
    )
    await session.commit()
    await reload_rules(session)
    return {"deleted": len(body.ids)}


@router.post("/bulk-toggle")
async def bulk_toggle_rules(
    body: BulkToggleRequest,
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not body.ids:
        return {"updated": 0}
    await session.execute(
        update(CategorizationRule)
        .where(CategorizationRule.id.in_(body.ids))
        .values(enabled=body.enabled)
    )
    await session.commit()
    await reload_rules(session)
    return {"updated": len(body.ids)}


@router.post("/rescan")
async def rescan_rules(session: AsyncSession = Depends(get_session)) -> dict:
    # Reset all match stats
    await session.execute(
        update(CategorizationRule).values(match_count=0, last_matched_at=None)
    )
    await session.flush()
    await reload_rules(session)

    # Scan ALL transactions for match counting so manually-tagged transactions
    # still contribute to match_count (avoids "0 matches" on rules the user
    # already verified by hand-tagging). Only update category on rule-sourced rows.
    txn_result = await session.execute(select(Transaction))
    transactions = txn_result.scalars().all()

    updated = 0
    matched_rule_ids: list[int] = []
    for txn in transactions:
        new_cat, rule_id = categorise(txn.description)
        if rule_id is not None:
            matched_rule_ids.append(rule_id)
        if txn.category_source == "rule" and new_cat != txn.category:
            txn.category = new_cat
            updated += 1

    await update_match_stats(session, matched_rule_ids)
    await session.commit()

    unused_result = await session.execute(
        select(sa_func.count(CategorizationRule.id)).where(
            CategorizationRule.match_count == 0
        )
    )
    rules_unused = unused_result.scalar() or 0

    return {
        "updated": updated,
        "rules_matched": len(set(matched_rule_ids)),
        "rules_unused": rules_unused,
    }


@router.post("/preview", response_model=RulePreviewResponse)
async def preview_rule_changes(
    body: dict,
    session: AsyncSession = Depends(get_session),
) -> RulePreviewResponse:
    """Given a list of {description, new_category}, return suggested rule patches."""
    result = await session.execute(
        select(CategorizationRule)
        .where(CategorizationRule.enabled == True)  # noqa: E712
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


@router.patch("/{rule_id}", response_model=RuleOut)
async def update_rule(
    rule_id: int,
    body: RuleUpdate,
    session: AsyncSession = Depends(get_session),
) -> RuleOut:
    result = await session.execute(
        select(CategorizationRule).where(CategorizationRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    if body.pattern is not None:
        rule.pattern = body.pattern
    if body.category is not None:
        rule.category = body.category
    if body.priority is not None:
        rule.priority = body.priority
    if body.enabled is not None:
        rule.enabled = body.enabled

    await session.commit()
    await session.refresh(rule)
    await reload_rules(session)
    return RuleOut.model_validate(rule)


@router.delete("/{rule_id}")
async def delete_rule(
    rule_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(
        select(CategorizationRule).where(CategorizationRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await session.delete(rule)
    await session.commit()
    await reload_rules(session)
    return {"deleted": rule_id}
