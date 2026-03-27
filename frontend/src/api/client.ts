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
  startMonth?: string,
  endMonth?: string
): Promise<MonthlySpend[]> {
  const qs = new URLSearchParams();
  if (startMonth) qs.set("start_month", startMonth);
  if (endMonth) qs.set("end_month", endMonth);
  return request(`/analytics/monthly-spend-by-category?${qs}`);
}

export async function fetchIncomeVsExpenses(): Promise<IncomeVsExpenses[]> {
  return request("/analytics/income-vs-expenses");
}

export async function fetchMerchantBreakdown(
  startMonth?: string,
  endMonth?: string,
  limit = 20
): Promise<MerchantBreakdown[]> {
  const qs = new URLSearchParams();
  if (startMonth) qs.set("start_month", startMonth);
  if (endMonth) qs.set("end_month", endMonth);
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
  startMonth?: string,
  endMonth?: string
): Promise<SpendingFlow> {
  const qs = new URLSearchParams();
  if (startMonth) qs.set("start_month", startMonth);
  if (endMonth) qs.set("end_month", endMonth);
  return request(`/analytics/spending-flow?${qs}`);
}

// -- Rules --

export interface RulePreviewItem {
  description: string;
  new_category: string;
  suggested_pattern: string;
  existing_rule_index: number | null;
  existing_rule_pattern: string | null;
  existing_rule_category: string | null;
}

export interface RulePreviewResponse {
  items: RulePreviewItem[];
}

export interface RulePatch {
  pattern: string;
  category: string;
  existing_rule_index: number | null;
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
