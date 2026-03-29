const STORAGE_KEY = "dashboard_graph_visibility";

export const GRAPH_ITEMS = [
  { id: "monthly_spend",        label: "Monthly Spend by Category" },
  { id: "income_vs_expenses",   label: "Income vs Expenses" },
  { id: "spending_by_category", label: "Spending by Category" },
  { id: "unspent_money",        label: "Unspent Money per Month" },
  { id: "top_merchants",        label: "Top Merchants" },
  { id: "spending_flow",        label: "Spending Flow" },
  { id: "category_month_table", label: "Breakdown by Category — Last 3 Months" },
] as const;

export type GraphId = (typeof GRAPH_ITEMS)[number]["id"];

function readStorage(): Record<GraphId, boolean> {
  const defaults = Object.fromEntries(
    GRAPH_ITEMS.map((g) => [g.id, true])
  ) as Record<GraphId, boolean>;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function getGraphVisibility(): Record<GraphId, boolean> {
  return readStorage();
}

export function setGraphVisible(id: GraphId, visible: boolean): void {
  const current = readStorage();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, [id]: visible }));
}
