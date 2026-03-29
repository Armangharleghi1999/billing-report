from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CategoryName(Base):
    __tablename__ = "category_names"

    name: Mapped[str] = mapped_column(String, primary_key=True)
