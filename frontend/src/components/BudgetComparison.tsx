import { useEffect, useState } from "react";
import {
  fetchAvailableMonths,
  fetchBudget,
  fetchBudgetComparison,
  type BudgetComparisonOut,
} from "../api/client";

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

interface BudgetComparisonProps {
  budgetId: number;
  onBack: () => void;
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
    <div style={{ maxWidth: 860 }}>
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

      {!comparisonLoading && comparison && (
        <>
          <div style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Spending</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Category</th>
                  <th style={thRightStyle}>Projected</th>
                  <th style={thRightStyle}>Actual</th>
                  <th style={thRightStyle}>Difference</th>
                  <th style={thRightStyle}>Status</th>
                </tr>
              </thead>
              <tbody>
                {comparison.categories.map((row) => (
                  <tr key={row.category}>
                    <td style={tdStyle}>{row.category}</td>
                    <td style={tdRightStyle}>{formatMoney(row.projected, budgetCurrency)}</td>
                    <td style={tdRightStyle}>{formatMoney(row.actual, budgetCurrency)}</td>
                    <td style={tdRightStyle}>{formatDiff(row.difference, budgetCurrency)}</td>
                    <td style={tdRightStyle}>
                      {row.difference > 0 ? (
                        <span style={{ color: "var(--success)" }}>Under</span>
                      ) : row.difference < 0 ? (
                        <span style={{ color: "var(--danger)" }}>Over</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>On budget</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700 }}>
                  <td style={tdStyle}>Total</td>
                  <td style={tdRightStyle}>{formatMoney(comparison.total_projected_spend, budgetCurrency)}</td>
                  <td style={tdRightStyle}>{formatMoney(comparison.total_actual_spend, budgetCurrency)}</td>
                  <td style={tdRightStyle}>
                    {formatDiff(comparison.total_projected_spend - comparison.total_actual_spend, budgetCurrency)}
                  </td>
                  <td style={tdRightStyle} />
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
        </>
      )}
    </div>
  );
}
