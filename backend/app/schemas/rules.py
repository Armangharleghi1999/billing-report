from datetime import datetime

from pydantic import BaseModel


class RulePreviewItem(BaseModel):
    description: str
    new_category: str
    suggested_pattern: str
    existing_rule_id: int | None = None
    existing_rule_pattern: str | None = None
    existing_rule_category: str | None = None


class RulePreviewResponse(BaseModel):
    items: list[RulePreviewItem]


class RulePatch(BaseModel):
    pattern: str
    category: str
    existing_rule_id: int | None = None


class ApplyRulesRequest(BaseModel):
    patches: list[RulePatch]


# Full CRUD schemas


class RuleOut(BaseModel):
    id: int
    pattern: str
    category: str
    priority: int
    enabled: bool
    created_at: datetime
    updated_at: datetime
    last_matched_at: datetime | None = None
    match_count: int

    model_config = {"from_attributes": True}


class RuleCreate(BaseModel):
    pattern: str
    category: str
    priority: int | None = None
    enabled: bool = True


class RuleUpdate(BaseModel):
    pattern: str | None = None
    category: str | None = None
    priority: int | None = None
    enabled: bool | None = None


class PaginatedRules(BaseModel):
    items: list[RuleOut]
    total: int
    page: int
    page_size: int
    pages: int


class BulkDeleteRequest(BaseModel):
    ids: list[int]


class BulkToggleRequest(BaseModel):
    ids: list[int]
    enabled: bool


class TestPatternRequest(BaseModel):
    pattern: str


class TestPatternResponse(BaseModel):
    matches: list[str]
    count: int


class RuleStatsOut(BaseModel):
    total_enabled: int
    categories_covered: int
    unused_count: int
    last_updated: datetime | None = None
