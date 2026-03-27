from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class MerchantNote(Base):
    __tablename__ = "merchant_notes"

    merchant: Mapped[str] = mapped_column(String, primary_key=True)
    note: Mapped[str] = mapped_column(String, nullable=False)
