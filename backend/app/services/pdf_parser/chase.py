import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

import pdfplumber

from app.services.pdf_parser.base import BaseStatementParser, ParsedTransaction

# US Chase: MM/DD or MM/DD/YYYY
SHORT_DATE_US = re.compile(r"^(\d{2}/\d{2})$")
FULL_DATE_US = re.compile(r"^(\d{2}/\d{2}/\d{4})$")
LINE_PATTERN_US = re.compile(r"^(\d{2}/\d{2})\s+(.+?)\s+(-?\$?[\d,]+\.\d{2})\s*$")

# UK Chase: "01 Jan 2026" or "01 January 2026"
UK_DATE = re.compile(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$")
# Period patterns
PERIOD_PATTERN_UK = re.compile(
    r"(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})",
    re.IGNORECASE,
)
PERIOD_PATTERN_US_TEXT = re.compile(
    r"(\w+\s+\d{1,2},?\s+\d{4})\s+(?:through|to|-)\s+(\w+\s+\d{1,2},?\s+\d{4})",
    re.IGNORECASE,
)
PERIOD_PATTERN_NUMERIC = re.compile(
    r"(\d{2}/\d{2}/\d{4})\s+(?:through|to|-)\s+(\d{2}/\d{2}/\d{4})",
    re.IGNORECASE,
)

HEADER_SENTINELS = {
    "date",
    "description",
    "amount",
    "transaction",
    "details",
    "balance",
}


def _parse_uk_date(text: str) -> date | None:
    """Parse UK date strings like '01 Jan 2026' or '01 January 2026'."""
    text = text.strip()
    m = UK_DATE.match(text)
    if not m:
        return None
    try:
        return datetime.strptime(text, "%d %b %Y").date()
    except ValueError:
        try:
            return datetime.strptime(text, "%d %B %Y").date()
        except ValueError:
            return None


def _clean_uk_amount(raw: str) -> tuple[Decimal, bool]:
    """Parse UK Chase amounts: '+£150.00' → (150.00, True), '-£12.00' → (12.00, False)."""
    text = raw.strip()
    # '+' prefix means credit (money in), '-' prefix means debit (money out)
    is_credit = text.startswith("+")
    text = text.lstrip("+-").replace("£", "").replace(",", "").strip()
    return Decimal(text), is_credit


class ChaseParser(BaseStatementParser):
    """Parser for Chase PDF statements (US and UK format)."""

    def __init__(self) -> None:
        self._statement_year: int | None = None
        self._is_uk_format: bool = False

    def parse(self, pdf_bytes: bytes) -> list[ParsedTransaction]:
        transactions: list[ParsedTransaction] = []

        # Detect period first to resolve partial dates and format
        period_start, period_end = self.detect_period(pdf_bytes)
        if period_end:
            self._statement_year = period_end.year

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                # Try table extraction first
                table = page.extract_table()
                if table:
                    transactions.extend(self._parse_table(table))
                else:
                    # Fall back to line-by-line text parsing
                    text = page.extract_text() or ""
                    if self._is_uk_format:
                        transactions.extend(self._parse_text_uk(text))
                    else:
                        transactions.extend(self._parse_text_us(text))

        return transactions

    def detect_period(self, pdf_bytes: bytes) -> tuple[date | None, date | None]:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages[:2]:
                text = page.extract_text() or ""

                # UK format: "01 January 2026 - 31 January 2026"
                match = PERIOD_PATTERN_UK.search(text)
                if match:
                    start = _parse_uk_date(match.group(1))
                    end = _parse_uk_date(match.group(2))
                    if start and end:
                        self._is_uk_format = True
                        return start, end

                # US numeric: MM/DD/YYYY through MM/DD/YYYY
                match = PERIOD_PATTERN_NUMERIC.search(text)
                if match:
                    start = self._parse_full_date_mmddyyyy(match.group(1))
                    end = self._parse_full_date_mmddyyyy(match.group(2))
                    return start, end

                # US text: "January 1, 2025 through January 31, 2025"
                match = PERIOD_PATTERN_US_TEXT.search(text)
                if match:
                    from dateutil.parser import parse as dateparse

                    try:
                        start = dateparse(match.group(1)).date()
                        end = dateparse(match.group(2)).date()
                        return start, end
                    except Exception:
                        pass

        return None, None

    def _parse_table(self, table: list[list[str | None]]) -> list[ParsedTransaction]:
        results: list[ParsedTransaction] = []
        for row in table:
            if not row or len(row) < 3:
                continue

            if any(
                cell and cell.strip().lower() in HEADER_SENTINELS
                for cell in row
                if cell
            ):
                continue

            date_cell = (row[0] or "").strip()
            # Description may contain newlines (e.g. "Merchant\nDirect Debit") — use first line
            raw_desc = (row[1] or "").strip()
            description = raw_desc.split("\n")[0].strip()

            if not description:
                continue

            # 4-column UK table: [date, description, amount, balance]
            # 3-column US table: [date, description, amount]
            if len(row) >= 4:
                amount_str = (row[2] or "").strip()
            else:
                amount_str = (row[-1] or "").strip()

            if not amount_str:
                continue

            # Try UK date first, then US
            txn_date = _parse_uk_date(date_cell) if self._is_uk_format else None
            if txn_date is None:
                txn_date = self._resolve_date_us(date_cell)
            if txn_date is None:
                continue

            try:
                if self._is_uk_format:
                    amount, is_credit = _clean_uk_amount(amount_str)
                else:
                    amount, is_credit = self.clean_amount(amount_str)
            except (ValueError, InvalidOperation):
                continue

            results.append(
                ParsedTransaction(
                    date=txn_date,
                    description=description,
                    amount=amount,
                    is_credit=is_credit,
                    merchant=self._extract_merchant(description),
                )
            )
        return results

    def _parse_text_uk(self, text: str) -> list[ParsedTransaction]:
        """Parse UK Chase text: 'DD Mon YYYY  Description  -/+£amount'."""
        results: list[ParsedTransaction] = []
        # Pattern: date (DD Mon YYYY), description, amount (+/-£x.xx), balance (£x.xx)
        line_pattern = re.compile(
            r"^(\d{1,2}\s+\w{3,}\s+\d{4})\s+(.+?)\s+([+\-]£[\d,]+\.\d{2})\s+£[\d,]+\.\d{2}\s*$"
        )
        for line in text.split("\n"):
            line = line.strip()
            m = line_pattern.match(line)
            if not m:
                continue
            txn_date = _parse_uk_date(m.group(1))
            if not txn_date:
                continue
            description = m.group(2).strip()
            try:
                amount, is_credit = _clean_uk_amount(m.group(3))
            except (ValueError, InvalidOperation):
                continue
            results.append(
                ParsedTransaction(
                    date=txn_date,
                    description=description,
                    amount=amount,
                    is_credit=is_credit,
                    merchant=self._extract_merchant(description),
                )
            )
        return results

    def _parse_text_us(self, text: str) -> list[ParsedTransaction]:
        results: list[ParsedTransaction] = []
        for line in text.split("\n"):
            line = line.strip()
            match = LINE_PATTERN_US.match(line)
            if not match:
                continue
            date_str = match.group(1)
            description = match.group(2).strip()
            amount_str = match.group(3)
            txn_date = self._resolve_date_us(date_str)
            if not txn_date:
                continue
            try:
                amount, is_credit = self.clean_amount(amount_str)
            except (ValueError, InvalidOperation):
                continue
            results.append(
                ParsedTransaction(
                    date=txn_date,
                    description=description,
                    amount=amount,
                    is_credit=is_credit,
                    merchant=self._extract_merchant(description),
                )
            )
        return results

    def _resolve_date_us(self, date_str: str) -> date | None:
        """Resolve US-format date strings: MM/DD or MM/DD/YYYY."""
        date_str = date_str.strip()
        if FULL_DATE_US.match(date_str):
            return self._parse_full_date_mmddyyyy(date_str)
        if SHORT_DATE_US.match(date_str):
            year = self._statement_year or date.today().year
            parts = date_str.split("/")
            try:
                return date(year, int(parts[0]), int(parts[1]))
            except ValueError:
                return None
        return None

    @staticmethod
    def _parse_full_date_mmddyyyy(date_str: str) -> date:
        parts = date_str.split("/")
        return date(int(parts[2]), int(parts[0]), int(parts[1]))

    @staticmethod
    def _extract_merchant(description: str) -> str:
        cleaned = re.sub(r"\b\d{6,}\b", "", description).strip()
        words = cleaned.split()
        return " ".join(words[:4]).upper() if words else description.upper()
