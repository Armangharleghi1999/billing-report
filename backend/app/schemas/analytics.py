from decimal import Decimal

from pydantic import BaseModel


class SpendingFlowMerchant(BaseModel):
    name: str
    total: Decimal


class SpendingFlowCategory(BaseModel):
    name: str
    total: Decimal
    merchants: list[SpendingFlowMerchant]


class SpendingFlow(BaseModel):
    income: Decimal
    categories: list[SpendingFlowCategory]
    unspent: Decimal


class MonthlySpendByCategory(BaseModel):
    month: str  # "2025-01"
    category: str
    total: Decimal


class IncomeVsExpenses(BaseModel):
    month: str
    income: Decimal
    expenses: Decimal
    money_from_friends: Decimal
    savings: Decimal


class MerchantBreakdownItem(BaseModel):
    merchant: str
    total: Decimal
    count: int


class SummaryKPIs(BaseModel):
    avg_monthly_spend: Decimal
    total_income: Decimal
    total_money_from_friends: Decimal
    savings_rate: Decimal  # percentage
    top_category: str | None
    total_transactions: int
