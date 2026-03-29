# Budget Template Generator — Implementation Plan

## Overview

When the user clicks **Create Budget**, they're shown a choice prompt: **Blank** or **Auto-generate from History**. The auto-generated option queries the last 3 months of transactions, finds merchants appearing in every month (recurring), takes the median spend, and pre-fills `BudgetForm` grouped by category.

---

## 1. Backend: New Pydantic Schemas

**Modify:** `backend/app/schemas/budget.py` — append after existing comparison schemas:

- `BudgetTemplateLineItem` — fields: `merchant: str`, `median_amount: Decimal`
- `BudgetTemplateCategory` — fields: `category: str`, `projected_total: Decimal`, `line_items: list[BudgetTemplateLineItem]`
- `BudgetTemplateOut` — fields: `months_analyzed: int`, `categories: list[BudgetTemplateCategory]`

---

## 2. Backend: New Service Function

**Create:** `backend/app/services/budget_template.py`

```python
async def generate_budget_template(session: AsyncSession) -> BudgetTemplateOut
```

Algorithm:

1. Find latest transaction date via `func.max(Transaction.date)`. If none, return empty template with `months_analyzed=0`.
2. Derive the 3 calendar months ending with that month (e.g. latest = 2026-02-15 -> months are 2025-12, 2026-01, 2026-02). Use `date(year, month, 1)` for boundaries.
3. Query expense transactions in range: `is_credit == False`, `category NOT IN ('Income', 'Savings', 'Investments', 'Money From Friends')`, `merchant IS NOT NULL`, `category IS NOT NULL`.
4. Group by `(merchant, month_label)` with `SUM(amount)` — same month-label pattern as `analytics.py` line 35.
5. **Find recurring merchants** — keep only merchants appearing in ALL months that have data.
6. **Compute median** — for each recurring merchant, sort its monthly totals, take middle value. Round to 2 decimal places.
7. **Resolve category per merchant** — use the mode (most frequent) across months. Ties -> alphabetical.
8. **Group by category** — `projected_total` = sum of line items. Sort categories alphabetically.

---

## 3. Backend: New Endpoint

**Modify:** `backend/app/routers/budgets.py`

Add `GET /template` **before** the `/{budget_id}` route (critical — otherwise FastAPI matches "template" as an integer param):

```python
@router.get("/template", response_model=BudgetTemplateOut)
async def get_budget_template(session: AsyncSession = Depends(get_session)):
    from app.services.budget_template import generate_budget_template
    return await generate_budget_template(session)
```

---

## 4. Frontend: API Client

**Modify:** `frontend/src/api/client.ts` — append after budget functions (~line 596):

- Types: `BudgetTemplateLineItem`, `BudgetTemplateCategory`, `BudgetTemplateOut`
- Function: `fetchBudgetTemplate(): Promise<BudgetTemplateOut>` -> `GET /budgets/template`

---

## 5. Frontend: BudgetForm — Accept Initial Data

**Modify:** `frontend/src/components/BudgetForm.tsx`:

- **Export** the `CategoryFormRow`, `LineItemFormRow`, and `IncomeFormRow` interfaces (lines 11, 16, 22) so `Budgeting.tsx` can use them.
- **Add prop** `initialData?: { categories: CategoryFormRow[]; incomeItems: IncomeFormRow[] } | null` to `BudgetFormProps`.
- **In the `useEffect` (line 75-105):** after the `if (budgetId !== null)` block, add `else if (initialData)` to populate `categories` and `incomeItems` state from the prop.

---

## 6. Frontend: Choice Modal Component

**Create:** `frontend/src/components/BudgetCreateChoice.tsx`

Props: `onChooseBlank`, `onChooseTemplate`, `onCancel`.

Render a centered card with two side-by-side option buttons:

- **"Blank Budget"** — "Start from scratch." -> calls `onChooseBlank`
- **"Auto-generate from History"** — "Pre-fill with recurring spending from your last 3 months." -> calls `onChooseTemplate`
- A cancel/back link.

Use inline styles with CSS variables (`--bg-card`, `--border`, `--radius`, `--primary`) consistent with the rest of the codebase.

---

## 7. Frontend: Budgeting Page Wiring

**Modify:** `frontend/src/pages/Budgeting.tsx`:

- Add `"choice"` to the `view` state type union.
- Add `templateData` state: `useState<{ categories: CategoryFormRow[]; incomeItems: IncomeFormRow[] } | null>(null)`.
- Change both "Create Budget" `onClick` handlers -> `setView("choice")` instead of `setView("form")`.
- Add `if (view === "choice")` block that renders `<BudgetCreateChoice>`:
  - `onChooseBlank` -> `setTemplateData(null); setView("form")`
  - `onChooseTemplate` -> calls `fetchBudgetTemplate()`, maps response to `CategoryFormRow[]` (with `useLineItems: true`, line items = `{ description: merchant, amount: median_amount.toString() }`), sets `templateData`, then `setView("form")`. If `months_analyzed === 0` or categories empty -> alert fallback, open blank.
  - `onCancel` -> `setView("list")`
- Pass `initialData={templateData}` to `<BudgetForm>`.
- Add imports for `BudgetCreateChoice`, `fetchBudgetTemplate`.

---

## 8. Edge Cases

| Scenario | Handling |
|---|---|
| No transactions at all | `months_analyzed=0`, empty categories -> alert + blank form |
| <3 months of data | Works with 1-2 months; merchants must appear in ALL available months |
| Category has no recurring merchants | Omitted from template |
| Merchant with NULL category/merchant | Filtered out in query |
| Merchant categorized differently across months | Use mode (most frequent category) |
| Large amounts | Round `median_amount` to 2dp in service |

---

## 9. Implementation Sequence

1. Backend schemas (`budget.py`)
2. Backend service (`budget_template.py` — new file)
3. Backend endpoint (`budgets.py` — add before `/{budget_id}`)
4. Frontend API client (`client.ts`)
5. Frontend BudgetForm changes (`BudgetForm.tsx` — export interfaces + `initialData` prop)
6. Frontend choice component (`BudgetCreateChoice.tsx` — new file)
7. Frontend Budgeting page wiring (`Budgeting.tsx`)

---

## 10. Files Summary

**Create (2):**

- `backend/app/services/budget_template.py`
- `frontend/src/components/BudgetCreateChoice.tsx`

**Modify (5):**

- `backend/app/schemas/budget.py`
- `backend/app/routers/budgets.py`
- `frontend/src/api/client.ts`
- `frontend/src/components/BudgetForm.tsx`
- `frontend/src/pages/Budgeting.tsx`
