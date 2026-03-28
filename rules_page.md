# Rules Management Page — Implementation Plan

## Overview

A dedicated "Rules" page in the frontend sidebar (alongside Dashboard, Upload, Transactions, Budgeting) for managing categorisation rules stored in the `categorization_rules` DB table.

## Data model reference

The `CategorizationRule` model (already implemented):

| Column | Type | Description |
|--------|------|-------------|
| id | int | Primary key |
| pattern | str | Regex pattern (matched case-insensitively) |
| category | str | Target category name |
| priority | int | Higher = matched first |
| enabled | bool | Disabled rules are skipped during matching |
| created_at | datetime | When the rule was created |
| updated_at | datetime | Last modification time |
| last_matched_at | datetime | Last time this rule matched a transaction |
| match_count | int | Total number of times this rule has matched |

## Page layout

### Header row
- Page title: "Categorisation Rules"
- "Add Rule" button (primary style, top-right)
- Search input: filters rules by pattern or category (client-side filter)

### Stats bar
A row of small KPI cards:
- Total rules (count of enabled rules)
- Categories covered (distinct categories)
- Unused rules (rules with match_count == 0, highlighted in amber)
- Last updated (most recent updated_at across all rules)

### Rules table
A full-width table with columns:

| Column | Sortable | Description |
|--------|----------|-------------|
| Priority | Yes | Numeric, shown as badge |
| Pattern | Yes | Monospace font, the regex pattern |
| Category | Yes | Shown as colored badge |
| Matches | Yes | match_count, right-aligned |
| Last matched | Yes | Relative time ("3 days ago") or "Never" |
| Enabled | No | Toggle switch |
| Actions | No | Edit, Delete buttons |

Default sort: priority DESC (highest priority first).

### Filtering
- Category dropdown filter (multi-select or single-select)
- "Show unused only" toggle (filters to match_count == 0)
- "Show disabled" toggle (shows disabled rules, hidden by default)

### Inline editing
Clicking "Edit" on a row opens an inline edit mode:
- Pattern: text input (monospace)
- Category: dropdown (populated from distinct categories + allow typing new)
- Priority: number input
- Save / Cancel buttons

### Add Rule modal (or inline)
- Pattern input (monospace, with regex validation preview)
- Category dropdown
- Priority: auto-set to max + 10, editable
- "Test pattern" button: shows a few matching transaction descriptions from the DB

### Bulk actions
- Checkbox column for multi-select
- "Delete selected" (with confirmation)
- "Disable selected" / "Enable selected"
- "Merge selected" (if same category — combines into... actually with one-pattern-per-row, merge doesn't apply)

### Cleanup tools (section at bottom, collapsible)
- "Find unused rules" — highlights rules with match_count == 0
- "Re-scan all transactions" — runs recategorise and updates match_count for all rules
- "Find duplicate patterns" — shows patterns that match the same text (subset detection)

## New API endpoints needed

### `GET /api/rules` — List all rules
Query params: `category`, `enabled`, `sort_by`, `sort_order`, `search`, `page`, `page_size`
Response: paginated list of rules with all fields

### `POST /api/rules` — Create a single rule
Body: `{ pattern, category, priority?, enabled? }`
Auto-assigns priority if not provided (max + 10).

### `PATCH /api/rules/{rule_id}` — Update a rule
Body: partial update `{ pattern?, category?, priority?, enabled? }`

### `DELETE /api/rules/{rule_id}` — Delete a rule

### `POST /api/rules/bulk-delete` — Delete multiple rules
Body: `{ ids: [1, 2, 3] }`

### `POST /api/rules/bulk-toggle` — Enable/disable multiple rules
Body: `{ ids: [1, 2, 3], enabled: true }`

### `POST /api/rules/test-pattern` — Test a pattern against transaction descriptions
Body: `{ pattern: "TESCO" }`
Response: `{ matches: ["TESCO STORES 1234", "TESCO EXTRA 5678", ...], count: 42 }`
(Returns up to 10 example matches and total count)

### `POST /api/rules/rescan` — Re-scan all rule-categorised transactions
Resets match_count for all rules, then re-categorises all transactions, updating match stats.
Response: `{ updated: 150, rules_matched: 85, rules_unused: 12 }`

## Frontend file structure

```
frontend/src/
  pages/
    Rules.tsx          # Top-level page (table, filters, stats)
  components/
    RuleEditRow.tsx    # Inline edit form for a single rule
    RuleAddForm.tsx    # Add new rule form
    RuleStats.tsx      # Stats bar component
```

## App.tsx changes
- Add import: `import Rules from "./pages/Rules";`
- Add nav item: `{ to: "/rules", label: "Rules" }`
- Add route: `<Route path="/rules" element={<Rules />} />`

## Styling
All inline styles using existing CSS variables. Follow the same patterns used in Transactions.tsx (paginated table, filters, inline editing).

## Implementation order
1. Backend: new CRUD endpoints + test-pattern + rescan
2. Frontend: Rules.tsx page with table and filters
3. Frontend: inline editing
4. Frontend: add rule form
5. Frontend: bulk actions
6. Frontend: cleanup tools section
7. App.tsx routing + nav

## Dependencies
- `CategorizationRule` model (already exists)
- `categoriser.py` service with `load_rules`, `reload_rules`, `update_match_stats` (already exists)
- Existing CSS variables and styling patterns
