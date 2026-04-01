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

**Step 1 — create the category**

Go to the **Rules** page → **Categories** tab. Click **Add Category**, enter the name, and save. The category immediately becomes available in all UI dropdowns (it is served live from `/api/categories`).

**Step 2 — add a rule to match transactions**

On the **Rules** page → **Rules** tab, click **Add Rule**. Enter a regex pattern and assign it to the new category. Place higher-priority rules above broader ones using the priority ordering.

Patterns are case-insensitive regexes. Use `|` for alternatives, `\b` for word boundaries. Test your regex at [regex101.com](https://regex101.com) with the Python flavour.

**Step 3 — re-apply rules to existing transactions**

Click the **Recategorise** button on the Dashboard. This re-runs all rules against every transaction that was auto-categorised (i.e. `category_source = "rule"`). Manually set categories are preserved.

Alternatively, call the API directly:

```bash
curl -X POST http://localhost:8000/api/transactions/recategorise
```

---

### Deleting a category

**Step 1 — update or remove rules that use this category**

On the **Rules** page → **Rules** tab, find any rules assigned to the category being deleted. Either delete them or reassign them to an existing category.

**Step 2 — delete the category**

On the **Rules** page → **Categories** tab, click the delete icon next to the category. This cascades: any rules still assigned to it are also removed.

> **Note:** Deleting a category removes it from the dropdowns but does not retroactively recategorise transactions already stored with that category. Those will continue to appear in charts until recategorised.

**Step 3 — re-apply rules and clean up existing transactions**

Click **Recategorise** on the Dashboard (or `curl -X POST http://localhost:8000/api/transactions/recategorise`) to re-run rules against all auto-categorised transactions.

If any transactions were **manually** set to the deleted category, they will not be touched by the recategorise step. Find and fix them on the **Transactions** page by filtering by the old category name.

---

## Running Tests

```bash
cd backend
python -m pytest tests/ -v
```
