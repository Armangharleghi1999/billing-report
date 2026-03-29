from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy import func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_session
from app.models import (
    Budget,
    BudgetCategory,
    BudgetIncomeItem,
    BudgetLineItem,
    CategorizationRule,
    Transaction,
)
from app.schemas.budget import (
    BudgetComparisonOut,
    BudgetCreate,
    BudgetOut,
    BudgetSummaryOut,
    BudgetUpdate,
    CategoryComparison,
    IncomeComparison,
)

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("/available-months", response_model=list[str])
async def get_available_months(
    session: AsyncSession = Depends(get_session),
) -> list[str]:
    result = await session.execute(
        text(
            "SELECT DISTINCT strftime('%Y-%m', date) as month FROM transactions ORDER BY month DESC"
        )
    )
    return [row[0] for row in result.all()]


@router.get("/categories", response_model=list[str])
async def get_categories(
    session: AsyncSession = Depends(get_session),
) -> list[str]:
    result = await session.execute(
        select(CategorizationRule.category)
        .where(CategorizationRule.enabled == True)
        .distinct()
    )
    return sorted(row[0] for row in result.all())


@router.get("/", response_model=list[BudgetSummaryOut])
async def list_budgets(
    session: AsyncSession = Depends(get_session),
) -> list[BudgetSummaryOut]:
    result = await session.execute(
        select(Budget)
        .options(selectinload(Budget.categories), selectinload(Budget.income_items))
        .order_by(Budget.updated_at.desc())
    )
    budgets = result.scalars().all()
    summaries = []
    for b in budgets:
        total_projected = sum((c.projected_total for c in b.categories), Decimal(0))
        total_income = sum((i.amount for i in b.income_items), Decimal(0))
        summaries.append(
            BudgetSummaryOut(
                id=b.id,
                name=b.name,
                currency=b.currency,
                created_at=b.created_at.isoformat(),
                updated_at=b.updated_at.isoformat(),
                total_projected=total_projected,
                total_income=total_income,
                category_count=len(b.categories),
            )
        )
    return summaries


@router.post("/", response_model=BudgetOut)
async def create_budget(
    data: BudgetCreate,
    session: AsyncSession = Depends(get_session),
) -> BudgetOut:
    budget_obj = Budget(name=data.name, currency=data.currency)
    for cat in data.categories:
        category_obj = BudgetCategory(
            category=cat.category,
            projected_total=cat.projected_total,
            budget=budget_obj,
        )
        for li in cat.line_items:
            BudgetLineItem(
                description=li.description,
                amount=li.amount,
                budget_category=category_obj,
            )
    for inc in data.income_items:
        BudgetIncomeItem(
            description=inc.description,
            amount=inc.amount,
            income_type=inc.income_type,
            budget=budget_obj,
        )
    session.add(budget_obj)
    await session.commit()

    result = await session.execute(
        select(Budget)
        .where(Budget.id == budget_obj.id)
        .options(
            selectinload(Budget.categories).selectinload(BudgetCategory.line_items),
            selectinload(Budget.income_items),
        )
    )
    fetched = result.scalar_one()
    return _budget_to_out(fetched)


@router.get("/{budget_id}", response_model=BudgetOut)
async def get_budget(
    budget_id: int,
    session: AsyncSession = Depends(get_session),
) -> BudgetOut:
    result = await session.execute(
        select(Budget)
        .where(Budget.id == budget_id)
        .options(
            selectinload(Budget.categories).selectinload(BudgetCategory.line_items),
            selectinload(Budget.income_items),
        )
    )
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    return _budget_to_out(budget)


@router.put("/{budget_id}", response_model=BudgetOut)
async def update_budget(
    budget_id: int,
    data: BudgetUpdate,
    session: AsyncSession = Depends(get_session),
) -> BudgetOut:
    result = await session.execute(
        select(Budget)
        .where(Budget.id == budget_id)
        .options(
            selectinload(Budget.categories).selectinload(BudgetCategory.line_items),
            selectinload(Budget.income_items),
        )
    )
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    budget.name = data.name
    budget.currency = data.currency
    budget.categories.clear()
    budget.income_items.clear()
    await session.flush()

    for cat in data.categories:
        category_obj = BudgetCategory(
            category=cat.category,
            projected_total=cat.projected_total,
            budget=budget,
        )
        session.add(category_obj)
        for li in cat.line_items:
            li_obj = BudgetLineItem(
                description=li.description,
                amount=li.amount,
                budget_category=category_obj,
            )
            session.add(li_obj)
    for inc in data.income_items:
        inc_obj = BudgetIncomeItem(
            description=inc.description,
            amount=inc.amount,
            income_type=inc.income_type,
            budget=budget,
        )
        session.add(inc_obj)

    budget.updated_at = datetime.now()
    await session.commit()

    result = await session.execute(
        select(Budget)
        .where(Budget.id == budget_id)
        .options(
            selectinload(Budget.categories).selectinload(BudgetCategory.line_items),
            selectinload(Budget.income_items),
        )
    )
    fetched = result.scalar_one()
    return _budget_to_out(fetched)


@router.delete("/{budget_id}")
async def delete_budget(
    budget_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict:
    result = await session.execute(select(Budget).where(Budget.id == budget_id))
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    await session.delete(budget)
    await session.commit()
    return {"deleted": True}


@router.get("/{budget_id}/compare/{month}", response_model=BudgetComparisonOut)
async def compare_budget(
    budget_id: int,
    month: str,
    session: AsyncSession = Depends(get_session),
) -> BudgetComparisonOut:
    year, mon = month.split("-")
    first_day = date(int(year), int(mon), 1)
    if int(mon) == 12:
        next_month_first = date(int(year) + 1, 1, 1)
    else:
        next_month_first = date(int(year), int(mon) + 1, 1)

    result = await session.execute(
        select(Budget)
        .where(Budget.id == budget_id)
        .options(
            selectinload(Budget.categories).selectinload(BudgetCategory.line_items),
            selectinload(Budget.income_items),
        )
    )
    budget = result.scalar_one_or_none()
    if budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    exp_result = await session.execute(
        select(Transaction.category, sa_func.sum(Transaction.amount))
        .where(Transaction.date >= first_day)
        .where(Transaction.date < next_month_first)
        .where(Transaction.is_credit == False)
        .group_by(Transaction.category)
    )
    actual_expenses = {
        row[0] or "Other": Decimal(str(row[1])) for row in exp_result.all()
    }

    inc_result = await session.execute(
        select(Transaction.category, sa_func.sum(Transaction.amount))
        .where(Transaction.date >= first_day)
        .where(Transaction.date < next_month_first)
        .where(Transaction.is_credit == True)
        .group_by(Transaction.category)
    )
    actual_income_raw = {
        row[0] or "Other": Decimal(str(row[1])) for row in inc_result.all()
    }

    actual_income: dict[str, Decimal] = {
        "Income": Decimal(0),
        "Money From Friends": Decimal(0),
        "Other": Decimal(0),
    }
    for cat, total in actual_income_raw.items():
        if cat == "Income":
            actual_income["Income"] += total
        elif cat == "Money From Friends":
            actual_income["Money From Friends"] += total
        else:
            actual_income["Other"] += total

    budget_category_names = {c.category for c in budget.categories}
    category_comparisons: list[CategoryComparison] = []
    for cat in budget.categories:
        projected = cat.projected_total
        actual = actual_expenses.get(cat.category, Decimal(0))
        difference = projected - actual
        pct = (actual / projected * 100) if projected > 0 else None
        category_comparisons.append(
            CategoryComparison(
                category=cat.category,
                projected=projected,
                actual=actual,
                difference=difference,
                percent_of_projected=pct,
            )
        )
    for cat_name, actual in actual_expenses.items():
        if cat_name not in budget_category_names:
            category_comparisons.append(
                CategoryComparison(
                    category=cat_name,
                    projected=Decimal(0),
                    actual=actual,
                    difference=Decimal(0) - actual,
                    percent_of_projected=None,
                )
            )

    income_comparisons: list[IncomeComparison] = []
    for income_type in ("Income", "Money From Friends", "Other"):
        projected = sum(
            (i.amount for i in budget.income_items if i.income_type == income_type),
            Decimal(0),
        )
        actual = actual_income[income_type]
        income_comparisons.append(
            IncomeComparison(
                income_type=income_type,
                projected=projected,
                actual=actual,
                difference=actual - projected,
            )
        )

    total_projected_spend = sum(
        (c.projected_total for c in budget.categories), Decimal(0)
    )
    total_actual_spend = sum(actual_expenses.values(), Decimal(0))
    total_projected_income = sum((i.amount for i in budget.income_items), Decimal(0))
    total_actual_income = sum(actual_income.values(), Decimal(0))
    projected_surplus = total_projected_income - total_projected_spend
    actual_surplus = total_actual_income - total_actual_spend

    return BudgetComparisonOut(
        budget_id=budget.id,
        budget_name=budget.name,
        month=month,
        currency=budget.currency,
        categories=category_comparisons,
        income=income_comparisons,
        total_projected_spend=total_projected_spend,
        total_actual_spend=total_actual_spend,
        total_projected_income=total_projected_income,
        total_actual_income=total_actual_income,
        projected_surplus=projected_surplus,
        actual_surplus=actual_surplus,
    )


def _budget_to_out(b: Budget) -> BudgetOut:
    from app.schemas.budget import (
        BudgetCategoryOut,
        BudgetIncomeItemOut,
        BudgetLineItemOut,
    )

    return BudgetOut(
        id=b.id,
        name=b.name,
        currency=b.currency,
        created_at=b.created_at.isoformat(),
        updated_at=b.updated_at.isoformat(),
        categories=[
            BudgetCategoryOut(
                id=c.id,
                category=c.category,
                projected_total=c.projected_total,
                line_items=[
                    BudgetLineItemOut(
                        id=li.id, description=li.description, amount=int(li.amount)
                    )
                    for li in c.line_items
                ],
            )
            for c in b.categories
        ],
        income_items=[
            BudgetIncomeItemOut(
                id=i.id,
                description=i.description,
                amount=i.amount,
                income_type=i.income_type,
            )
            for i in b.income_items
        ],
    )
