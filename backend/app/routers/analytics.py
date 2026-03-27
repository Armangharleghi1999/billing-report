from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas.analytics import (
    IncomeVsExpenses,
    MerchantBreakdownItem,
    MonthlySpendByCategory,
    SpendingFlow,
    SummaryKPIs,
)
from app.services.analytics import (
    income_vs_expenses,
    merchant_breakdown,
    monthly_spend_by_category,
    spending_flow,
    summary_kpis,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/monthly-spend-by-category", response_model=list[MonthlySpendByCategory])
async def get_monthly_spend_by_category(
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    session: AsyncSession = Depends(get_session),
) -> list[MonthlySpendByCategory]:
    return await monthly_spend_by_category(session, start_date, end_date)


@router.get("/income-vs-expenses", response_model=list[IncomeVsExpenses])
async def get_income_vs_expenses(
    session: AsyncSession = Depends(get_session),
) -> list[IncomeVsExpenses]:
    return await income_vs_expenses(session)


@router.get("/merchant-breakdown", response_model=list[MerchantBreakdownItem])
async def get_merchant_breakdown(
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[MerchantBreakdownItem]:
    return await merchant_breakdown(session, start_date, end_date, limit)


@router.get("/spending-flow", response_model=SpendingFlow)
async def get_spending_flow(
    start_date: str | None = Query(None, description="YYYY-MM-DD"),
    end_date: str | None = Query(None, description="YYYY-MM-DD"),
    session: AsyncSession = Depends(get_session),
) -> SpendingFlow:
    return await spending_flow(session, start_date, end_date)


@router.get("/summary", response_model=SummaryKPIs)
async def get_summary(
    session: AsyncSession = Depends(get_session),
) -> SummaryKPIs:
    return await summary_kpis(session)
