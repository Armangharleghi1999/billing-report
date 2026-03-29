import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import {
  fetchAvailableMonths,
  fetchBudget,
  fetchBudgetComparison,
  type BudgetComparisonOut,
} from "../api/client";

const PIE_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
];

interface PieSlice { name: string; value: number; extra?: string; }

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || "£";
  return `${symbol}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDiff(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || "£";
  const prefix = amount >= 0 ? "+" : "-";
  return `${prefix}${symbol}${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Returns the colour for a spend difference cell.
 *  difference = projected - actual (positive = under, negative = over) */
function spendDiffColor(difference: number, projected: number): string | undefined {
  if (difference > 0) return "var(--success)";
  if (difference === 0) return undefined;
  // over budget — check how far over relative to projected
  const overpct = projected > 0 ? Math.abs(difference) / projected : 1;
  return overpct <= 0.1 ? "#f59e0b" : "var(--danger)";
}

interface BudgetComparisonProps {
  budgetId: number;
  onBack: () => void;
}

function MiniPieCard({
  title,
  slices,
  currency,
  emptyMsg,
  extraLabel = false,
}: {
  title: string;
  slices: PieSlice[];
  currency: string;
  emptyMsg: string;
  extraLabel?: boolean;
}) {
  const symbol = { GBP: "£", USD: "$", EUR: "€" }[currency] ?? "£";
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, d) => s + d.value, 0);

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>{title}</div>
      {slices.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
          {emptyMsg}
        </div>
      ) : (
        <>
          <PieChart width={200} height={160} style={{ margin: "0 auto" }}>
            <Pie data={sorted} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} innerRadius={28}>
              {sorted.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(value: number, name: string, props) => {
                const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                const extra = (props.payload as PieSlice).extra;
                return [
                  extraLabel && extra
                    ? `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${extra})`
                    : `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${pct}%)`,
                  name,
                ];
              }}
            />
          </PieChart>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {sorted.map((s, i) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{s.name}</span>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  {extraLabel && s.extra ? s.extra : `${(total > 0 ? (s.value / total) * 100 : 0).toFixed(0)}%`}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: 13,
  color: "var(--text-muted)",
  borderBottom: "2px solid var(--border)",
  textAlign: "left",
};

const thRightStyle: React.CSSProperties = { ...thStyle, textAlign: "right" };

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  borderBottom: "1px solid var(--border)",
};

const tdRightStyle: React.CSSProperties = { ...tdStyle, textAlign: "right" };

export default function BudgetComparison({ budgetId, onBack }: BudgetComparisonProps) {
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [comparison, setComparison] = useState<BudgetComparisonOut | null>(null);
  const [budgetName, setBudgetName] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("GBP");
  const [loading, setLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [budget, availableMonths] = await Promise.all([
        fetchBudget(budgetId),
        fetchAvailableMonths(),
      ]);
      setBudgetName(budget.name);
      setBudgetCurrency(budget.currency);
      setMonths(availableMonths);
      if (availableMonths.length > 0) {
        setSelectedMonth(availableMonths[0]);
      }
      setLoading(false);
    }
    load();
  }, [budgetId]);

  useEffect(() => {
    if (!selectedMonth) return;
    setComparisonLoading(true);
    fetchBudgetComparison(budgetId, selectedMonth)
      .then(setComparison)
      .finally(() => setComparisonLoading(false));
  }, [budgetId, selectedMonth]);

  const inputStyle: React.CSSProperties = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text)",
    padding: "6px 10px",
    fontSize: 13,
  };

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading...</p>;
  }

  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          fontSize: 14,
          cursor: "pointer",
          marginBottom: 16,
          padding: 0,
        }}
      >
        &lt; Back to Budgets
      </button>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>{budgetName}</h2>
        {months.length > 0 && (
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={inputStyle}
          >
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
      </div>

      {months.length === 0 && (
        <p style={{ color: "var(--text-muted)" }}>
          No transaction data available to compare against. Upload statements first.
        </p>
      )}

      {comparisonLoading && (
        <p style={{ color: "var(--text-muted)" }}>Loading comparison...</p>
      )}

      {!comparisonLoading && comparison && (() => {
        const projectedSlices: PieSlice[] = comparison.categories
          .filter((r) => Number(r.projected) > 0)
          .map((r) => ({ name: r.category, value: Number(r.projected) }));

        const actualSlices: PieSlice[] = comparison.categories
          .filter((r) => Number(r.actual) > 0)
          .map((r) => ({ name: r.category, value: Number(r.actual) }));

        const overSlices: PieSlice[] = comparison.categories
          .filter((r) => Number(r.difference) < 0)
          .map((r) => ({
            name: r.category,
            value: Math.abs(Number(r.difference)),
            extra: Number(r.projected) > 0
              ? `${((Math.abs(Number(r.difference)) / Number(r.projected)) * 100).toFixed(1)}% over`
              : "–",
          }));

        const underSlices: PieSlice[] = comparison.categories
          .filter((r) => Number(r.difference) > 0)
          .map((r) => ({
            name: r.category,
            value: Number(r.difference),
            extra: Number(r.projected) > 0
              ? `${((Number(r.difference) / Number(r.projected)) * 100).toFixed(1)}% saved`
              : "–",
          }));

        return (
        <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
          {/* ── Left: existing tables ── */}
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Spending</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Category</th>
                  <th style={thRightStyle}>Projected</th>
                  <th style={thRightStyle}>Actual</th>
                  <th style={thRightStyle}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {comparison.categories.map((row) => (
                  <tr key={row.category}>
                    <td style={tdStyle}>{row.category}</td>
                    <td style={tdRightStyle}>{formatMoney(row.projected, budgetCurrency)}</td>
                    <td style={tdRightStyle}>{formatMoney(row.actual, budgetCurrency)}</td>
                    <td style={{ ...tdRightStyle, color: spendDiffColor(Number(row.difference), Number(row.projected)) }}>
                      {formatDiff(row.difference, budgetCurrency)}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  <td style={tdRightStyle}>{formatMoney(comparison.total_projected_spend, budgetCurrency)}</td>
                  <td style={tdRightStyle}>{formatMoney(comparison.total_actual_spend, budgetCurrency)}</td>
                  <td style={{ ...tdRightStyle, color: spendDiffColor(Number(comparison.total_projected_spend) - Number(comparison.total_actual_spend), Number(comparison.total_projected_spend)) }}>
                    {formatDiff(comparison.total_projected_spend - comparison.total_actual_spend, budgetCurrency)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Money In</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Type</th>
                  <th style={thRightStyle}>Projected</th>
                  <th style={thRightStyle}>Actual</th>
                  <th style={thRightStyle}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {comparison.income.map((row) => (
                  <tr key={row.income_type}>
                    <td style={tdStyle}>{row.income_type}</td>
                    <td style={tdRightStyle}>{formatMoney(row.projected, budgetCurrency)}</td>
                    <td style={tdRightStyle}>{formatMoney(row.actual, budgetCurrency)}</td>
                    <td style={tdRightStyle}>
                      <span style={{ color: row.difference >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {formatDiff(row.difference, budgetCurrency)}
                      </span>
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  <td style={tdRightStyle}>{formatMoney(comparison.total_projected_income, budgetCurrency)}</td>
                  <td style={tdRightStyle}>{formatMoney(comparison.total_actual_income, budgetCurrency)}</td>
                  <td style={tdRightStyle}>
                    <span
                      style={{
                        color:
                          comparison.total_actual_income - comparison.total_projected_income >= 0
                            ? "var(--success)"
                            : "var(--danger)",
                      }}
                    >
                      {formatDiff(
                        comparison.total_actual_income - comparison.total_projected_income,
                        budgetCurrency
                      )}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 20,
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              Projected surplus:{" "}
              <strong
                style={{
                  color: comparison.projected_surplus >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {formatMoney(comparison.projected_surplus, budgetCurrency)}
                {comparison.projected_surplus < 0 ? " (deficit)" : ""}
              </strong>
            </div>
            <div style={{ fontSize: 13 }}>
              Actual surplus:{" "}
              <strong
                style={{
                  color: comparison.actual_surplus >= 0 ? "var(--success)" : "var(--danger)",
                }}
              >
                {formatMoney(comparison.actual_surplus, budgetCurrency)}
                {comparison.actual_surplus < 0 ? " (deficit)" : ""}
              </strong>
            </div>
          </div>
          </div>{/* end left column */}

          {/* ── Right: 4 pie charts ── */}
          <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: 460 }}>
            <MiniPieCard
              title="Projected Spend"
              slices={projectedSlices}
              currency={budgetCurrency}
              emptyMsg="No projected spend"
            />
            <MiniPieCard
              title="Actual Spend"
              slices={actualSlices}
              currency={budgetCurrency}
              emptyMsg="No actual spend"
            />
            <MiniPieCard
              title="Over Budget"
              slices={overSlices}
              currency={budgetCurrency}
              emptyMsg="Nothing over budget"
              extraLabel
            />
            <MiniPieCard
              title="Under Budget (Saved)"
              slices={underSlices}
              currency={budgetCurrency}
              emptyMsg="Nothing under budget"
              extraLabel
            />
          </div>
        </div>
        );
      })()}
    </div>
  );
}
