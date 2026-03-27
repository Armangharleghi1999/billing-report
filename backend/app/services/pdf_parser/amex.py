import io
import re
from datetime import date
from decimal import Decimal, InvalidOperation

import pdfplumber

from app.services.pdf_parser.base import BaseStatementParser, ParsedTransaction

# Abbreviated month names -> month number
_MONTH_MAP = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}

# Full month names -> month number
_FULL_MONTH_MAP = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}

# Transaction line: MonDD MonDD DESCRIPTION AMOUNT
# e.g. "Dec26 Dec26 BOOTS THE CHEMIST LONDON 8.90"
_TXN_LINE = re.compile(
    r"^([A-Za-z]{3})(\d{1,2})\s+[A-Za-z]{3}\d{1,2}\s+(.+?)\s+([\d,]+\.\d{2})\s*$"
)

# Statement period — handles spacing variations from pdfplumber
# e.g. "From 20December to19January2026" or "From 20 December to 19 January 2026"
_PERIOD_PATTERN = re.compile(
    r"From\s*(\d{1,2})\s*([A-Za-z]+)\s*(?:(\d{4})\s*)?to\s*(\d{1,2})\s*([A-Za-z]+)\s*(\d{4})",
    re.IGNORECASE,
)


class AmexParser(BaseStatementParser):
    """Parser for American Express UK PDF statements."""

    def parse(self, pdf_bytes: bytes) -> list[ParsedTransaction]:
        # First detect the period so we can resolve years for short dates
        period_start, period_end = self.detect_period(pdf_bytes)
        statement_year = period_end.year if period_end else date.today().year
        statement_end_month = period_end.month if period_end else 12

        transactions: list[ParsedTransaction] = []
        prev_amount_line = False  # track if previous line was a transaction

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                lines = text.split("\n")

                i = 0
                while i < len(lines):
                    line = lines[i].strip()
                    i += 1

                    if not line:
                        continue

                    # Check if this is a CR line (credit indicator for previous txn)
                    if line == "CR" and transactions:
                        transactions[-1] = ParsedTransaction(
                            date=transactions[-1].date,
                            description=transactions[-1].description,
                            amount=transactions[-1].amount,
                            is_credit=True,
                            merchant=transactions[-1].merchant,
                        )
                        continue

                    match = _TXN_LINE.match(line)
                    if not match:
                        continue

                    month_abbr = match.group(1).lower()
                    day = int(match.group(2))
                    description = match.group(3).strip()
                    amount_str = match.group(4)

                    if month_abbr not in _MONTH_MAP:
                        continue

                    month = _MONTH_MAP[month_abbr]

                    # Resolve year: months after statement end month belong to the
                    # previous year (e.g., Dec transactions on a Jan 19 statement)
                    if period_end and month > statement_end_month:
                        year = statement_year - 1
                    else:
                        year = statement_year

                    try:
                        txn_date = date(year, month, day)
                        amount = Decimal(amount_str.replace(",", ""))
                    except (ValueError, InvalidOperation):
                        continue

                    # Skip "Total new spend" summary lines
                    if "total new spend" in description.lower():
                        continue

                    transactions.append(
                        ParsedTransaction(
                            date=txn_date,
                            description=description,
                            amount=amount,
                            is_credit=False,
                            merchant=self._extract_merchant(description),
                        )
                    )

        return transactions

    def detect_period(self, pdf_bytes: bytes) -> tuple[date | None, date | None]:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages[:2]:
                text = page.extract_text() or ""
                match = _PERIOD_PATTERN.search(text)
                if match:
                    start_day = int(match.group(1))
                    start_month_name = match.group(2).lower()
                    start_year_str = match.group(3)  # may be None
                    end_day = int(match.group(4))
                    end_month_name = match.group(5).lower()
                    end_year = int(match.group(6))

                    start_month = _FULL_MONTH_MAP.get(start_month_name)
                    end_month = _FULL_MONTH_MAP.get(end_month_name)
                    if not start_month or not end_month:
                        continue

                    # If start year is explicit use it, otherwise infer
                    if start_year_str:
                        start_year = int(start_year_str)
                    else:
                        # If start month > end month, start is previous year
                        start_year = (
                            end_year - 1 if start_month > end_month else end_year
                        )

                    try:
                        return date(start_year, start_month, start_day), date(
                            end_year, end_month, end_day
                        )
                    except ValueError:
                        continue
        return None, None

    @staticmethod
    def _extract_merchant(description: str) -> str:
        """Normalise merchant name from description."""
        # Remove reference numbers and extra whitespace
        cleaned = re.sub(r"\b\d{6,}\b", "", description).strip()
        # Remove location suffixes (LONDON, EDINBURGH, etc.)
        cleaned = re.sub(
            r"\s+(LONDON|EDINBURGH|CAMBRIDGE|BURY ST EDMUNDS|WEST DRAYTON|"
            r"HOLLYHILL|UXBRIDGE|NORFOLK|DISS|LON-CANNING TOW|WEST SUSSEX|"
            r"BOURNEMOUTH|SUNDERLAND|AMSTERDAM|Watford,|FULHAM|Edinburgh|London)\s*$",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
        # Take first few words as merchant
        words = cleaned.split()
        return " ".join(words[:5]).upper() if words else description.upper()
