from decimal import Decimal

from pydantic import BaseModel

# -- Request schemas --


class BudgetLineItemIn(BaseModel):
    description: str
    amount: Decimal


class BudgetCategoryIn(BaseModel):
    category: str
    projected_total: Decimal
    line_items: list[BudgetLineItemIn] = []


class BudgetIncomeItemIn(BaseModel):
    description: str
    amount: Decimal
    income_type: str


class BudgetCreate(BaseModel):
    name: str
    currency: str = "GBP"
    categories: list[BudgetCategoryIn] = []
    income_items: list[BudgetIncomeItemIn] = []


class BudgetUpdate(BaseModel):
    name: str
    currency: str = "GBP"
    categories: list[BudgetCategoryIn] = []
    income_items: list[BudgetIncomeItemIn] = []


# -- Response schemas --


class BudgetLineItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    description: str
    amount: Decimal


class BudgetCategoryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    category: str
    projected_total: Decimal
    line_items: list[BudgetLineItemOut] = []


class BudgetIncomeItemOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    description: str
    amount: Decimal
    income_type: str


class BudgetOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    currency: str
    created_at: str
    updated_at: str
    categories: list[BudgetCategoryOut] = []
    income_items: list[BudgetIncomeItemOut] = []


class BudgetSummaryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    name: str
    currency: str
    created_at: str
    updated_at: str
    total_projected: Decimal
    total_income: Decimal
    category_count: int


# -- Comparison schemas --


class CategoryComparison(BaseModel):
    category: str
    projected: Decimal
    actual: Decimal
    difference: Decimal
    percent_of_projected: Decimal | None


class IncomeComparison(BaseModel):
    income_type: str
    projected: Decimal
    actual: Decimal
    difference: Decimal


class BudgetComparisonOut(BaseModel):
    budget_id: int
    budget_name: str
    month: str
    currency: str
    categories: list[CategoryComparison]
    income: list[IncomeComparison]
    total_projected_spend: Decimal
    total_actual_spend: Decimal
    total_projected_income: Decimal
    total_actual_income: Decimal
    projected_surplus: Decimal
    actual_surplus: Decimal
