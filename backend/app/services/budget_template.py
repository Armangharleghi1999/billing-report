from collections import Counter
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Transaction
from app.schemas.budget import (
    BudgetTemplateCategory,
    BudgetTemplateLineItem,
    BudgetTemplateOut,
)

_EXCLUDE_CATS = {"Income", "Savings", "Investments", "Money From Friends"}


async def generate_budget_template(session: AsyncSession) -> BudgetTemplateOut:
    # 1. Find latest transaction date
    result = await session.execute(select(func.max(Transaction.date)))
    latest_date = result.scalar_one_or_none()
    if latest_date is None:
        return BudgetTemplateOut(months_analyzed=0, categories=[])

    # 2. Derive the 3 calendar months ending with that month
    year, month = latest_date.year, latest_date.month
    months = []
    for i in range(2, -1, -1):
        m = month - i
        y = year
        while m <= 0:
            m += 12
            y -= 1
        months.append((y, m))

    range_start = date(months[0][0], months[0][1], 1)
    last_y, last_m = months[-1]
    if last_m == 12:
        range_end = date(last_y + 1, 1, 1)
    else:
        range_end = date(last_y, last_m + 1, 1)

    # 3 & 4. Query expense transactions grouped by (merchant, month_label)
    year_col = extract("year", Transaction.date)
    month_col = extract("month", Transaction.date)
    month_label = func.printf("%04d-%02d", year_col, month_col)

    rows = await session.execute(
        select(
            Transaction.merchant,
            Transaction.category,
            month_label.label("month"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_EXCLUDE_CATS))
        .where(Transaction.category.is_not(None))
        .where(Transaction.merchant.is_not(None))
        .where(Transaction.date >= range_start)
        .where(Transaction.date < range_end)
        .group_by(Transaction.merchant, Transaction.category, month_label)
    )
    rows = rows.all()

    # Determine which months have any data
    months_with_data = sorted({row.month for row in rows})
    n = len(months_with_data)
    if n == 0:
        return BudgetTemplateOut(months_analyzed=0, categories=[])

    # Build per-merchant data: {merchant: {month: total}, category_counter}
    merchant_months: dict[str, dict[str, Decimal]] = {}
    merchant_cats: dict[str, list[str]] = {}

    for row in rows:
        m_name = row.merchant
        if m_name not in merchant_months:
            merchant_months[m_name] = {}
            merchant_cats[m_name] = []
        merchant_months[m_name][row.month] = Decimal(str(row.total))
        merchant_cats[m_name].append(row.category)

    # 5. Keep only merchants appearing in ALL months with data
    recurring = [m for m, mths in merchant_months.items() if len(mths) == n]

    if not recurring:
        return BudgetTemplateOut(months_analyzed=n, categories=[])

    # 6 & 7. Compute median and resolve category
    def median(values: list[Decimal]) -> Decimal:
        s = sorted(values)
        mid = len(s) // 2
        if len(s) % 2 == 1:
            return s[mid]
        return ((s[mid - 1] + s[mid]) / 2).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )

    def mode_category(cats: list[str]) -> str:
        counter = Counter(cats)
        max_count = max(counter.values())
        candidates = sorted(k for k, v in counter.items() if v == max_count)
        return candidates[0]

    # 8. Group by category
    cat_line_items: dict[str, list[BudgetTemplateLineItem]] = {}
    for merchant in recurring:
        monthly_totals = list(merchant_months[merchant].values())
        med = median(monthly_totals).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        category = mode_category(merchant_cats[merchant])
        if category not in cat_line_items:
            cat_line_items[category] = []
        cat_line_items[category].append(
            BudgetTemplateLineItem(merchant=merchant, median_amount=med)
        )

    categories = []
    for category in sorted(cat_line_items.keys()):
        line_items = sorted(cat_line_items[category], key=lambda li: li.merchant)
        projected_total = sum((li.median_amount for li in line_items), Decimal("0"))
        categories.append(
            BudgetTemplateCategory(
                category=category,
                projected_total=projected_total,
                line_items=line_items,
            )
        )

    return BudgetTemplateOut(months_analyzed=n, categories=categories)
