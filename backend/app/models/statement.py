from datetime import date, datetime

from sqlalchemy import Date, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Statement(Base):
    __tablename__ = "statements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String, nullable=False)  # 'amex' | 'chase'
    filename: Mapped[str] = mapped_column(String, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    file_hash: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    transactions: Mapped[list["Transaction"]] = relationship(  # noqa: F821
        back_populates="statement", cascade="all, delete-orphan"
    )
