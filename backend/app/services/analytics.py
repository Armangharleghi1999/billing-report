from decimal import Decimal

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.statement import Statement
from app.models.transaction import Transaction
from app.schemas.analytics import (
    IncomeVsExpenses,
    MerchantBreakdownItem,
    MonthlySpendByCategory,
    SpendingFlow,
    SpendingFlowCategory,
    SpendingFlowMerchant,
    SummaryKPIs,
)

# Categories excluded from expense calculations
_NON_SPEND_CATS = ("Income", "Savings", "Investments", "Money From Friends")

# Categories excluded from Chase-credit income fallback
# (Savings/Investments = returning own money; Money From Friends = counted separately)
_CHASE_INCOME_EXCLUDE = ("Savings", "Investments", "Money From Friends")


async def monthly_spend_by_category(
    session: AsyncSession,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[MonthlySpendByCategory]:
    """Group transactions by (year-month, category), excluding income/savings/credits."""
    year_col = extract("year", Transaction.date)
    month_col = extract("month", Transaction.date)
    month_label = func.printf("%04d-%02d", year_col, month_col)

    query = (
        select(
            month_label.label("month"),
            Transaction.category.label("category"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_NON_SPEND_CATS))
        .where(Transaction.category.is_not(None))
        .group_by(month_label, Transaction.category)
        .order_by(month_label)
    )

    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)

    result = await session.execute(query)
    return [
        MonthlySpendByCategory(
            month=row.month, category=row.category, total=Decimal(str(row.total))
        )
        for row in result.all()
    ]


async def income_vs_expenses(
    session: AsyncSession,
) -> list[IncomeVsExpenses]:
    """Calculate income vs expenses per month."""
    year_col = extract("year", Transaction.date)
    month_col = extract("month", Transaction.date)
    month_label = func.printf("%04d-%02d", year_col, month_col)

    # Expenses: debit transactions excluding savings/investments transfers
    expenses_q = (
        select(
            month_label.label("month"),
            func.sum(Transaction.amount).label("expenses"),
        )
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_NON_SPEND_CATS))
        .group_by(month_label)
    )
    expenses_result = await session.execute(expenses_q)
    expenses_map = {
        row.month: Decimal(str(row.expenses)) for row in expenses_result.all()
    }

    # Income: Chase account credits, excluding savings/investments/friends
    chase_income_q = (
        select(
            month_label.label("month"),
            func.sum(Transaction.amount).label("income"),
        )
        .join(Statement, Transaction.statement_id == Statement.id)
        .where(Transaction.is_credit == True)  # noqa: E712
        .where(Statement.source == "chase")
        .where(Transaction.category.not_in(_CHASE_INCOME_EXCLUDE))
        .group_by(month_label)
    )
    chase_income_result = await session.execute(chase_income_q)
    income_map = {
        row.month: Decimal(str(row.income)) for row in chase_income_result.all()
    }

    # Money From Friends credits — always tracked separately per month
    friends_q = (
        select(
            month_label.label("month"),
            func.sum(Transaction.amount).label("amount"),
        )
        .where(Transaction.is_credit == True)  # noqa: E712
        .where(Transaction.category == "Money From Friends")
        .group_by(month_label)
    )
    friends_result = await session.execute(friends_q)
    friends_map = {row.month: Decimal(str(row.amount)) for row in friends_result.all()}

    all_months = sorted(
        set(expenses_map.keys()) | set(income_map.keys()) | set(friends_map.keys())
    )
    results = []
    for m in all_months:
        inc = income_map.get(m, Decimal("0"))
        exp = expenses_map.get(m, Decimal("0"))
        friends = friends_map.get(m, Decimal("0"))
        results.append(
            IncomeVsExpenses(
                month=m,
                income=inc,
                expenses=exp,
                money_from_friends=friends,
                savings=inc + friends - exp,
            )
        )
    return results


async def merchant_breakdown(
    session: AsyncSession,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 20,
) -> list[MerchantBreakdownItem]:
    """Top N merchants by total spend."""
    query = (
        select(
            Transaction.merchant.label("merchant"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_NON_SPEND_CATS))
        .where(Transaction.merchant.is_not(None))
        .group_by(Transaction.merchant)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(limit)
    )

    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)

    result = await session.execute(query)
    return [
        MerchantBreakdownItem(
            merchant=row.merchant, total=Decimal(str(row.total)), count=row.count
        )
        for row in result.all()
    ]


async def spending_flow(
    session: AsyncSession,
    start_date: str | None = None,
    end_date: str | None = None,
) -> SpendingFlow:
    """Flow of income → categories → top merchants."""
    # --- Income ---
    # Chase account credits, excluding savings/investments/friends
    chase_income_q = (
        select(func.sum(Transaction.amount))
        .join(Statement, Transaction.statement_id == Statement.id)
        .where(Transaction.is_credit == True)  # noqa: E712
        .where(Statement.source == "chase")
        .where(Transaction.category.not_in(_CHASE_INCOME_EXCLUDE))
    )
    if start_date:
        chase_income_q = chase_income_q.where(Transaction.date >= start_date)
    if end_date:
        chase_income_q = chase_income_q.where(Transaction.date <= end_date)
    total_income = Decimal(str((await session.execute(chase_income_q)).scalar() or 0))

    # Add Money From Friends to total income
    friends_flow_q = (
        select(func.sum(Transaction.amount))
        .where(Transaction.is_credit == True)  # noqa: E712
        .where(Transaction.category == "Money From Friends")
    )
    if start_date:
        friends_flow_q = friends_flow_q.where(Transaction.date >= start_date)
    if end_date:
        friends_flow_q = friends_flow_q.where(Transaction.date <= end_date)
    total_income += Decimal(str((await session.execute(friends_flow_q)).scalar() or 0))

    # --- Spend by category (excluding savings/investments) ---
    cat_q = (
        select(
            Transaction.category.label("category"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_NON_SPEND_CATS))
        .where(Transaction.category.is_not(None))
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    )
    if start_date:
        cat_q = cat_q.where(Transaction.date >= start_date)
    if end_date:
        cat_q = cat_q.where(Transaction.date <= end_date)
    cat_rows = (await session.execute(cat_q)).all()

    categories: list[SpendingFlowCategory] = []
    total_expenses = Decimal("0")
    for row in cat_rows:
        cat_total = Decimal(str(row.total))
        total_expenses += cat_total

        # Top 5 merchants for this category
        merch_q = (
            select(
                Transaction.merchant.label("merchant"),
                func.sum(Transaction.amount).label("total"),
            )
            .where(Transaction.is_credit == False)  # noqa: E712
            .where(Transaction.category == row.category)
            .where(Transaction.merchant.is_not(None))
            .group_by(Transaction.merchant)
            .order_by(func.sum(Transaction.amount).desc())
            .limit(5)
        )
        if start_date:
            merch_q = merch_q.where(Transaction.date >= start_date)
        if end_date:
            merch_q = merch_q.where(Transaction.date <= end_date)
        merch_rows = (await session.execute(merch_q)).all()
        merchants = [
            SpendingFlowMerchant(name=m.merchant, total=Decimal(str(m.total)))
            for m in merch_rows
        ]
        categories.append(
            SpendingFlowCategory(
                name=row.category, total=cat_total, merchants=merchants
            )
        )

    unspent = total_income - total_expenses
    return SpendingFlow(income=total_income, categories=categories, unspent=unspent)


async def summary_kpis(session: AsyncSession) -> SummaryKPIs:
    """Calculate summary KPIs: avg monthly spend, total income, savings rate, top category."""
    # Total transactions
    count_q = select(func.count(Transaction.id))
    total_txn = (await session.execute(count_q)).scalar() or 0

    # Monthly spend totals (excluding savings/investments)
    year_col = extract("year", Transaction.date)
    month_col = extract("month", Transaction.date)
    month_label = func.printf("%04d-%02d", year_col, month_col)

    monthly_totals_q = (
        select(func.sum(Transaction.amount).label("total"))
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_NON_SPEND_CATS))
        .group_by(month_label)
    )
    monthly_result = await session.execute(monthly_totals_q)
    monthly_vals = [Decimal(str(r.total)) for r in monthly_result.all()]
    avg_monthly = (
        sum(monthly_vals) / len(monthly_vals) if monthly_vals else Decimal("0")
    )

    # Total income: Chase account credits, excluding savings/investments/friends
    chase_income_q = (
        select(func.sum(Transaction.amount))
        .join(Statement, Transaction.statement_id == Statement.id)
        .where(Transaction.is_credit == True)  # noqa: E712
        .where(Statement.source == "chase")
        .where(Transaction.category.not_in(_CHASE_INCOME_EXCLUDE))
    )
    total_income = Decimal(str((await session.execute(chase_income_q)).scalar() or 0))

    # Money From Friends — counted separately, included in savings rate
    friends_q = (
        select(func.sum(Transaction.amount))
        .where(Transaction.is_credit == True)  # noqa: E712
        .where(Transaction.category == "Money From Friends")
    )
    total_friends = Decimal(str((await session.execute(friends_q)).scalar() or 0))

    total_money_in = total_income + total_friends
    total_expenses = sum(monthly_vals)
    savings_rate = (
        ((total_money_in - total_expenses) / total_money_in * 100)
        if total_money_in > 0
        else Decimal("0")
    )

    # Top category by total spend (excluding savings/investments)
    top_cat_q = (
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.is_credit == False)  # noqa: E712
        .where(Transaction.category.not_in(_NON_SPEND_CATS))
        .where(Transaction.category.is_not(None))
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(1)
    )
    top_cat_result = await session.execute(top_cat_q)
    top_row = top_cat_result.first()
    top_category = top_row.category if top_row else None

    return SummaryKPIs(
        avg_monthly_spend=round(avg_monthly, 2),
        total_income=round(total_income, 2),
        total_money_from_friends=round(total_friends, 2),
        savings_rate=round(savings_rate, 2),
        top_category=top_category,
        total_transactions=total_txn,
    )
