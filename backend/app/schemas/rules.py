from pydantic import BaseModel


class RulePreviewItem(BaseModel):
    description: str
    new_category: str
    suggested_pattern: str
    existing_rule_index: int | None = None
    existing_rule_pattern: str | None = None
    existing_rule_category: str | None = None


class RulePreviewResponse(BaseModel):
    items: list[RulePreviewItem]


class RulePatch(BaseModel):
    pattern: str
    category: str
    existing_rule_index: int | None = None


class ApplyRulesRequest(BaseModel):
    patches: list[RulePatch]
