const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

// -- Ingest --

export interface TransactionPreview {
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  is_credit: boolean;
  category: string | null;
  dedup_hash: string | null;
}

export interface TransactionOut {
  id: number;
  statement_id: number;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  currency: string;
  category: string | null;
  category_source: string;
  is_credit: boolean;
  created_at: string;
}

export interface DuplicateItem {
  existing: TransactionOut;
  incoming: TransactionPreview;
}

export interface IngestResult {
  status: string;
  new_count: number;
  duplicate_count: number;
  new: TransactionPreview[];
  duplicates: DuplicateItem[];
  statement_id: number | null;
  detected_source: string | null;
}

export async function uploadStatement(file: File): Promise<IngestResult> {
  const form = new FormData();
  form.append("file", file);
  return request("/ingest/statement", { method: "POST", body: form });
}

export async function resolveDuplicates(
  statementId: number,
  resolutions: { dedup_hash: string; action: string }[]
) {
  return request("/ingest/resolve-duplicates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      statement_id: statementId,
      resolutions,
    }),
  });
}

export interface StatementOut {
  id: number;
  source: string;
  filename: string;
  period_start: string | null;
  period_end: string | null;
  imported_at: string;
  file_hash: string;
}

export async function fetchImportHistory(): Promise<StatementOut[]> {
  return request("/ingest/history");
}

export async function clearAllData(): Promise<{ deleted_statements: number }> {
  return request("/ingest/clear-all", { method: "DELETE" });
}

export async function recategoriseTransactions(): Promise<{ updated: number }> {
  return request("/transactions/recategorise", { method: "POST" });
}

// -- Transactions --

export interface PaginatedTransactions {
  items: TransactionOut[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export async function fetchTransactions(params: {
  page?: number;
  page_size?: number;
  category?: string;
  source?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  sort_by?: string;
  sort_order?: string;
}): Promise<PaginatedTransactions> {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  });
  return request(`/transactions?${qs}`);
}

export async function updateTransaction(
  id: number,
  data: { category?: string }
): Promise<TransactionOut> {
  return request(`/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteTransaction(id: number) {
  return request(`/transactions/${id}`, { method: "DELETE" });
}

// -- Analytics --

export interface MonthlySpend {
  month: string;
  category: string;
  total: number;
}

export interface IncomeVsExpenses {
  month: string;
  income: number;
  expenses: number;
  money_from_friends: number;
  savings: number;
}

export interface MerchantBreakdown {
  merchant: string;
  total: number;
  count: number;
}

export interface SummaryKPIs {
  avg_monthly_spend: number;
  total_income: number;
  total_money_from_friends: number;
  savings_rate: number;
  top_category: string | null;
  total_transactions: number;
}

export async function fetchMonthlySpend(
  startDate?: string,
  endDate?: string
): Promise<MonthlySpend[]> {
  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  return request(`/analytics/monthly-spend-by-category?${qs}`);
}

export async function fetchIncomeVsExpenses(): Promise<IncomeVsExpenses[]> {
  return request("/analytics/income-vs-expenses");
}

export async function fetchMerchantBreakdown(
  startDate?: string,
  endDate?: string,
  limit = 20
): Promise<MerchantBreakdown[]> {
  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  qs.set("limit", String(limit));
  return request(`/analytics/merchant-breakdown?${qs}`);
}

export async function fetchSummary(): Promise<SummaryKPIs> {
  return request("/analytics/summary");
}

export interface SpendingFlowMerchant {
  name: string;
  total: number;
}

export interface SpendingFlowCategory {
  name: string;
  total: number;
  merchants: SpendingFlowMerchant[];
}

export interface SpendingFlow {
  income: number;
  categories: SpendingFlowCategory[];
  unspent: number;
}

export async function fetchSpendingFlow(
  startDate?: string,
  endDate?: string
): Promise<SpendingFlow> {
  const qs = new URLSearchParams();
  if (startDate) qs.set("start_date", startDate);
  if (endDate) qs.set("end_date", endDate);
  return request(`/analytics/spending-flow?${qs}`);
}

// -- Rules --

export interface RulePreviewItem {
  description: string;
  new_category: string;
  suggested_pattern: string;
  existing_rule_id: number | null;
  existing_rule_pattern: string | null;
  existing_rule_category: string | null;
}

export interface RulePreviewResponse {
  items: RulePreviewItem[];
}

export interface RulePatch {
  pattern: string;
  category: string;
  existing_rule_id: number | null;
}

export async function bulkUpdateTransactions(
  items: { id: number; category: string }[]
): Promise<TransactionOut[]> {
  return request("/transactions/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
}

export async function previewRuleChanges(
  changes: { description: string; new_category: string }[]
): Promise<RulePreviewResponse> {
  return request("/rules/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes }),
  });
}

export async function applyRuleChanges(
  patches: RulePatch[]
): Promise<{ applied: number }> {
  return request("/rules/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patches }),
  });
}

// -- Merchant Notes --

export async function fetchMerchantNotes(): Promise<Record<string, string>> {
  return request("/merchant-notes");
}

export async function saveMerchantNotes(
  items: { merchant: string; note: string }[]
): Promise<void> {
  await request("/merchant-notes/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
}

// -- Budgets --

export interface BudgetLineItemIn {
  description: string;
  amount: number;
}

export interface BudgetCategoryIn {
  category: string;
  projected_total: number;
  line_items: BudgetLineItemIn[];
}

export interface BudgetIncomeItemIn {
  description: string;
  amount: number;
  income_type: string;
}

export interface BudgetCreate {
  name: string;
  currency: string;
  categories: BudgetCategoryIn[];
  income_items: BudgetIncomeItemIn[];
}

export interface BudgetLineItemOut {
  id: number;
  description: string;
  amount: number;
}

export interface BudgetCategoryOut {
  id: number;
  category: string;
  projected_total: number;
  line_items: BudgetLineItemOut[];
}

export interface BudgetIncomeItemOut {
  id: number;
  description: string;
  amount: number;
  income_type: string;
}

export interface BudgetOut {
  id: number;
  name: string;
  currency: string;
  created_at: string;
  updated_at: string;
  categories: BudgetCategoryOut[];
  income_items: BudgetIncomeItemOut[];
}

export interface BudgetSummaryOut {
  id: number;
  name: string;
  currency: string;
  created_at: string;
  updated_at: string;
  total_projected: number;
  total_income: number;
  category_count: number;
}

export interface CategoryComparison {
  category: string;
  projected: number;
  actual: number;
  difference: number;
  percent_of_projected: number | null;
}

export interface IncomeComparison {
  income_type: string;
  projected: number;
  actual: number;
  difference: number;
}

export interface BudgetComparisonOut {
  budget_id: number;
  budget_name: string;
  month: string;
  currency: string;
  categories: CategoryComparison[];
  income: IncomeComparison[];
  total_projected_spend: number;
  total_actual_spend: number;
  total_projected_income: number;
  total_actual_income: number;
  projected_surplus: number;
  actual_surplus: number;
}

export async function fetchBudgets(): Promise<BudgetSummaryOut[]> {
  return request("/budgets");
}

export async function fetchBudget(id: number): Promise<BudgetOut> {
  return request(`/budgets/${id}`);
}

export async function createBudget(data: BudgetCreate): Promise<BudgetOut> {
  return request("/budgets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateBudget(id: number, data: BudgetCreate): Promise<BudgetOut> {
  return request(`/budgets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteBudget(id: number): Promise<void> {
  await request(`/budgets/${id}`, { method: "DELETE" });
}

export async function fetchBudgetComparison(
  budgetId: number,
  month: string
): Promise<BudgetComparisonOut> {
  return request(`/budgets/${budgetId}/compare/${month}`);
}

export async function fetchAvailableMonths(): Promise<string[]> {
  return request("/budgets/available-months");
}

export async function fetchBudgetCategories(): Promise<string[]> {
  return request("/budgets/categories");
}
