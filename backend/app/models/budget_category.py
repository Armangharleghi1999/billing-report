from decimal import Decimal

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    budget_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("budgets.id"), nullable=False
    )
    category: Mapped[str] = mapped_column(String, nullable=False)
    projected_total: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    budget: Mapped["Budget"] = relationship(back_populates="categories")
    line_items: Mapped[list["BudgetLineItem"]] = relationship(
        back_populates="budget_category", cascade="all, delete-orphan"
    )
