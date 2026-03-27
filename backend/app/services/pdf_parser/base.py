from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any


@dataclass
class ParsedTransaction:
    date: date
    description: str
    amount: Decimal
    is_credit: bool = False
    merchant: str | None = None


class BaseStatementParser(ABC):
    """Abstract base class for PDF statement parsers."""

    @abstractmethod
    def parse(self, pdf_bytes: bytes) -> list[ParsedTransaction]:
        """Parse a PDF and return a list of transactions."""
        ...

    @abstractmethod
    def detect_period(self, pdf_bytes: bytes) -> tuple[date | None, date | None]:
        """Detect the statement period (start, end) from the PDF."""
        ...

    @staticmethod
    def clean_amount(raw: str) -> tuple[Decimal, bool]:
        """Parse a raw amount string into (abs_amount, is_credit).

        Handles formats like: -$1,234.56, $1,234.56 CR, (1,234.56), 1234.56
        """
        text = raw.strip()
        is_credit = False

        if text.upper().endswith("CR"):
            is_credit = True
            text = text[:-2].strip()

        if text.startswith("(") and text.endswith(")"):
            is_credit = True
            text = text[1:-1]

        if text.startswith("-"):
            is_credit = True
            text = text[1:]

        text = text.replace("$", "").replace("£", "").replace(",", "").strip()

        amount = Decimal(text)
        return amount, is_credit
