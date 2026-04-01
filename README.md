# Spending Visualiser

A full-stack app that ingests PDF bank statements (AMEX and Chase), persists data to SQLite, and presents month-to-month financial analytics via an interactive dashboard.

## Prerequisites

- Python 3.11+
- Node.js 18+ & npm

## Quick Start

### 1. Backend

```bash
# From the project root
cd backend

# Create a virtual environment and install dependencies
python -m venv ../.venv
../.venv/Scripts/activate       # Linux/macOS: source ../.venv/bin/activate
pip install -e ".[dev]"

# Run database migrations
alembic upgrade head

# Start the API server (run from the project root, not backend/)
cd ..
uvicorn main:app --reload --port 8000
```

The API is now available at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 2. Frontend

```bash
# In a second terminal, from the project root
cd frontend
npm install
npm run dev
```

The dashboard opens at `http://localhost:5173`. API calls are proxied to the backend automatically.

## Usage

1. Open the dashboard and go to **Upload**.
2. Drag & drop one or more AMEX or Chase PDF statements — the source is detected automatically.
3. The app parses transactions, categorises them, and checks for duplicates.
4. View spending breakdowns on the **Dashboard** page (charts for monthly spend by category, income vs expenses, top merchants, spending flow).
5. Browse and re-categorise individual transactions on the **Transactions** page.
6. Manage categorisation rules and categories on the **Rules** page (add, edit, enable/disable, delete rules; manage the category list via the Categories tab).
7. Set and track spending budgets on the **Budgeting** page.
8. Use the **Recategorise** button on the Dashboard to re-apply all rules to existing auto-categorised transactions.

## Project Structure

```
backend/
  app/
    routers/        # FastAPI endpoints (ingest, transactions, analytics, rules, categories, budgets, merchant_notes, auth)
    services/       # PDF parsers (AMEX, Chase), categoriser, dedup, analytics
    models/         # SQLAlchemy ORM models
    schemas/        # Pydantic request/response schemas
  tests/            # pytest test suite
  categorisation_rules.json  # Legacy seed file — rules now live in the database
frontend/
  src/
    pages/          # Dashboard, Upload, Transactions, Rules, Settings, Budgeting
    components/     # Charts (MonthlySpendByCategory, IncomeVsExpenses, SpendingFlow, MerchantBreakdown,
                    #   CategoryMonthTable, CategoryPieChart, CategoryDrilldown, UnspentMoney),
                    #   UploadZone, DuplicateReviewModal,
                    #   RuleAddForm, RuleEditRow, RuleStats, CategoriesTab,
                    #   BudgetForm, BudgetCreateChoice, BudgetComparison
    hooks/          # useCategories, useFetch, useGraphSettings
    api/            # Typed API client
data/               # SQLite database (gitignored)
main.py             # Root entry point for uvicorn
```

---

## Category Management

Categories are the core of the analytics — every chart, KPI, and table is grouped by category. Both the category list and the categorisation rules are **managed entirely through the UI** on the **Rules page** and stored in the database.

### How rules work

Each rule is a case-insensitive regex matched against the transaction description. Rules are evaluated **in order of priority — the first match wins**. Transactions with no matching rule are assigned the default category (`"Other"`).

Rules can be added, edited, reordered, toggled, and deleted on the **Rules** page. They are stored in the `CategorizationRule` database table — not in a flat file.

### Special categories (analytics behaviour)

These category names have hardcoded meaning in the analytics engine:

| Category | Behaviour |
|---|---|
| `Income` | Excluded from expense totals. Chase credit transactions in this category are counted as income in the Income vs Expenses chart. |
| `Money From Friends` | Counted as income separately. Shown as its own line in the chart and KPI card. Included in savings rate. |
| `Savings` | Excluded from expense totals and spend charts. |
| `Investments` | Excluded from expense totals and spend charts. |
| anything else (inc. `Transfers`) | Counted as an expense and shown in all spend charts. |

---

### Adding a new category

**Step 1 — add a rule to the rules file**

Open `backend/categorisation_rules.json` and insert a new rule object inside the `"rules"` array. Place it **before** any broader rules that might match the same transactions first.

```json
{
  "rules": [
    { "pattern": "EXISTING RULE", "category": "Existing Category" },
    { "pattern": "MY NEW MERCHANT|ANOTHER NAME", "category": "My New Category" },
    ...
  ]
}
```

Patterns are standard regexes. Use `|` for alternatives, `\\b` for word boundaries, and `\\.` to match a literal dot. Test your regex at [regex101.com](https://regex101.com) with the ECMA or Python flavour.

**Step 2 — add the category to both frontend CATEGORIES arrays**

Open each of these two files and add the new category name to the `CATEGORIES` array:

- `frontend/src/pages/Transactions.tsx` (line ~10)
- `frontend/src/components/charts/CategoryMonthTable.tsx` (line ~13)

```ts
const CATEGORIES = [
  "Groceries",
  "My New Category",   // <-- add here
  ...
];
```

The order of this array determines the order in the dropdowns.

**Step 3 — re-apply rules to existing transactions**

Click the **Recategorise** button on the Dashboard. This re-runs all rules against every transaction that was auto-categorised (i.e. `category_source = "rule"`). Manually set categories are preserved.

Alternatively, call the API directly:

```bash
curl -X POST http://localhost:8000/api/transactions/recategorise
```

---

### Deleting a category

**Step 1 — remove or update rules in the rules file**

Open `backend/categorisation_rules.json` and either:

- **Delete** the rule entirely if the pattern should fall through to a different category below it, or
- **Change** the `"category"` value to redirect matching transactions to an existing category.

**Step 2 — remove the category from both frontend CATEGORIES arrays**

Remove the entry from both:

- `frontend/src/pages/Transactions.tsx`
- `frontend/src/components/charts/CategoryMonthTable.tsx`

> **Note:** Removing a category from the UI arrays only removes it from the dropdowns — it does not affect transactions already stored in the database with that category. Those will still appear in charts until recategorised.

**Step 3 — re-apply rules and clean up existing transactions**

Click **Recategorise** on the Dashboard (or `curl -X POST http://localhost:8000/api/transactions/recategorise`) to re-run rules against all auto-categorised transactions.

If any transactions were **manually** set to the deleted category (i.e. you changed them via the UI), they will not be touched by the recategorise step. You can find and fix them on the **Transactions** page by filtering by the old category name.

---

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```
