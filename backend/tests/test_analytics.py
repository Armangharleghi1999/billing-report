import pytest
import pytest_asyncio
from datetime import date
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.statement import Statement
from app.models.transaction import Transaction
from app.services.analytics import monthly_spend_by_category, summary_kpis


@pytest.mark.asyncio
async def test_monthly_spend_empty(db_session: AsyncSession) -> None:
    result = await monthly_spend_by_category(db_session)
    assert result == []


@pytest.mark.asyncio
async def test_summary_kpis_empty(db_session: AsyncSession) -> None:
    result = await summary_kpis(db_session)
    assert result.total_transactions == 0
    assert result.avg_monthly_spend == Decimal("0")


@pytest.mark.asyncio
async def test_monthly_spend_with_data(db_session: AsyncSession) -> None:
    stmt = Statement(source="amex", filename="test.pdf", file_hash="abc123")
    db_session.add(stmt)
    await db_session.flush()

    txn1 = Transaction(
        statement_id=stmt.id,
        date=date(2025, 1, 15),
        description="TESCO",
        amount=Decimal("50.00"),
        category="Groceries",
        is_credit=False,
    )
    txn2 = Transaction(
        statement_id=stmt.id,
        date=date(2025, 1, 20),
        description="NETFLIX",
        amount=Decimal("12.99"),
        category="Subscriptions",
        is_credit=False,
    )
    db_session.add_all([txn1, txn2])
    await db_session.commit()

    result = await monthly_spend_by_category(db_session)
    assert len(result) == 2
    categories = {r.category for r in result}
    assert "Groceries" in categories
    assert "Subscriptions" in categories
