from decimal import Decimal

from app.services.pdf_parser.base import BaseStatementParser


def test_clean_amount_basic() -> None:
    amount, is_credit = BaseStatementParser.clean_amount("$1,234.56")
    assert amount == Decimal("1234.56")
    assert is_credit is False


def test_clean_amount_credit_suffix() -> None:
    amount, is_credit = BaseStatementParser.clean_amount("$50.00 CR")
    assert amount == Decimal("50.00")
    assert is_credit is True


def test_clean_amount_negative() -> None:
    amount, is_credit = BaseStatementParser.clean_amount("-$123.45")
    assert amount == Decimal("123.45")
    assert is_credit is True


def test_clean_amount_parens() -> None:
    amount, is_credit = BaseStatementParser.clean_amount("(99.99)")
    assert amount == Decimal("99.99")
    assert is_credit is True


def test_clean_amount_gbp() -> None:
    amount, is_credit = BaseStatementParser.clean_amount("£1,500.00")
    assert amount == Decimal("1500.00")
    assert is_credit is False


def test_clean_amount_plain() -> None:
    amount, is_credit = BaseStatementParser.clean_amount("42.00")
    assert amount == Decimal("42.00")
    assert is_credit is False
