from datetime import date
from decimal import Decimal

import pytest

from app.services.deduplication import compute_dedup_hash


def test_dedup_hash_consistency() -> None:
    h1 = compute_dedup_hash(date(2025, 1, 15), "TESCO STORES", Decimal("45.67"))
    h2 = compute_dedup_hash(date(2025, 1, 15), "TESCO STORES", Decimal("45.67"))
    assert h1 == h2


def test_dedup_hash_case_insensitive() -> None:
    h1 = compute_dedup_hash(date(2025, 1, 15), "tesco stores", Decimal("45.67"))
    h2 = compute_dedup_hash(date(2025, 1, 15), "TESCO STORES", Decimal("45.67"))
    assert h1 == h2


def test_dedup_hash_different_amounts() -> None:
    h1 = compute_dedup_hash(date(2025, 1, 15), "TESCO STORES", Decimal("45.67"))
    h2 = compute_dedup_hash(date(2025, 1, 15), "TESCO STORES", Decimal("45.68"))
    assert h1 != h2


def test_dedup_hash_different_dates() -> None:
    h1 = compute_dedup_hash(date(2025, 1, 15), "TESCO STORES", Decimal("45.67"))
    h2 = compute_dedup_hash(date(2025, 1, 16), "TESCO STORES", Decimal("45.67"))
    assert h1 != h2
