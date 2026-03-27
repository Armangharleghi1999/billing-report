from datetime import date, datetime

from pydantic import BaseModel


class StatementOut(BaseModel):
    id: int
    source: str
    filename: str
    period_start: date | None
    period_end: date | None
    imported_at: datetime
    file_hash: str

    model_config = {"from_attributes": True}
