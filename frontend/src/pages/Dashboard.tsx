import { useMemo, useState } from "react";
import {
  clearAllData,
  recategoriseTransactions,
  fetchIncomeVsExpenses,
  fetchMerchantBreakdown,
  fetchMonthlySpend,
  fetchSpendingFlow,
  fetchSummary,
} from "../api/client";
import CategoryMonthTable from "../components/charts/CategoryMonthTable";
import IncomeVsExpensesChart from "../components/charts/IncomeVsExpenses";
import MerchantBreakdownChart from "../components/charts/MerchantBreakdown";
import MonthlySpendByCategory from "../components/charts/MonthlySpendByCategory";
import SpendingFlowChart from "../components/charts/SpendingFlow";
import UnspentMoney from "../components/charts/UnspentMoney";
import { useFetch } from "../hooks/useFetch";

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  padding: "20px 24px",
  minWidth: 180,
};

function threeMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Dashboard() {
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");

  const [clearing, setClearing] = useState(false);
  const [recategorising, setRecategorising] = useState(false);

  const categoryTableStart = useMemo(() => threeMonthsAgo(), []);

  const { data: summary, loading: summaryLoading } = useFetch(fetchSummary);
  const { data: monthlySpend } = useFetch(
    () => fetchMonthlySpend(startMonth || undefined, endMonth || undefined),
    [startMonth, endMonth]
  );
  const { data: incomeVsExp } = useFetch(fetchIncomeVsExpenses);
  const { data: merchants } = useFetch(
    () =>
      fetchMerchantBreakdown(startMonth || undefined, endMonth || undefined),
    [startMonth, endMonth]
  );
  const { data: categoryTableData, refetch: refetchCategoryTable } = useFetch(
    () => fetchMonthlySpend(categoryTableStart, undefined),
    [categoryTableStart]
  );
  const { data: spendingFlow } = useFetch(
    () => fetchSpendingFlow(startMonth || undefined, endMonth || undefined),
    [startMonth, endMonth]
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Dashboard</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button
            onClick={async () => {
              setRecategorising(true);
              try {
                const result = await recategoriseTransactions();
                alert(`Recategorised ${result.updated} transaction(s).`);
                window.location.reload();
              } finally {
                setRecategorising(false);
              }
            }}
            disabled={recategorising}
            style={{
              padding: "7px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 13,
              fontWeight: 500,
              cursor: recategorising ? "not-allowed" : "pointer",
              opacity: recategorising ? 0.6 : 1,
            }}
          >
            {recategorising ? "Recategorising..." : "Recategorise"}
          </button>
          <button
            onClick={async () => {
              if (!confirm("Delete all statements and transactions? This cannot be undone.")) return;
              setClearing(true);
              try {
                await clearAllData();
                window.location.reload();
              } finally {
                setClearing(false);
              }
            }}
            disabled={clearing}
            style={{
              padding: "7px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--danger)",
              background: "transparent",
              color: "var(--danger)",
              fontSize: 13,
              fontWeight: 500,
              cursor: clearing ? "not-allowed" : "pointer",
              opacity: clearing ? 0.6 : 1,
            }}
          >
            {clearing ? "Clearing..." : "Clear Data"}
          </button>
          <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
            From
          </label>
          <input
            type="month"
            value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            style={filterInputStyle}
          />
          <label style={{ fontSize: 13, color: "var(--text-muted)" }}>To</label>
          <input
            type="month"
            value={endMonth}
            onChange={(e) => setEndMonth(e.target.value)}
            style={filterInputStyle}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Avg Monthly Spend
          </div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {summaryLoading
              ? "..."
              : `£${(summary?.avg_monthly_spend ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Total Income
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--success)" }}>
            {summaryLoading
              ? "..."
              : `£${(summary?.total_income ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            From Friends
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#06b6d4" }}>
            {summaryLoading
              ? "..."
              : `£${(summary?.total_money_from_friends ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Savings Rate
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)" }}>
            {summaryLoading ? "..." : `${summary?.savings_rate ?? 0}%`}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>
            Top Category
          </div>
          <div style={{ fontSize: 22, fontWeight: 600 }}>
            {summaryLoading ? "..." : summary?.top_category ?? "—"}
          </div>
        </div>
      </div>

      {/* Row 1: Monthly Spend + Income vs Expenses */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <CollapsibleCard title="Monthly Spend by Category">
          <MonthlySpendByCategory data={monthlySpend ?? []} />
        </CollapsibleCard>
        <CollapsibleCard title="Income vs Expenses">
          <IncomeVsExpensesChart data={incomeVsExp ?? []} />
        </CollapsibleCard>
      </div>

      {/* Row 2: Unspent Money (full width) */}
      <CollapsibleCard title="Unspent Money per Month" style={{ marginBottom: 24 }}>
        <UnspentMoney data={incomeVsExp ?? []} />
      </CollapsibleCard>

      {/* Row 3: Top Merchants */}
      <CollapsibleCard title="Top Merchants" style={{ marginBottom: 24 }}>
        <MerchantBreakdownChart data={merchants ?? []} />
      </CollapsibleCard>

      {/* Row 4: Spending Flow (Sankey) */}
      <CollapsibleCard title="Spending Flow" defaultOpen={false} style={{ marginBottom: 24 }}>
        {spendingFlow ? (
          <SpendingFlowChart data={spendingFlow} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        )}
      </CollapsibleCard>

      {/* Row 5: Category × Month Table */}
      <CollapsibleCard title="Spending by Category — Last 3 Months" defaultOpen={false}>
        <CategoryMonthTable
          data={categoryTableData ?? []}
          onDataChanged={refetchCategoryTable}
        />
      </CollapsibleCard>
    </div>
  );
}

function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  style,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ ...cardStyle, padding: 24, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? 16 : 0 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>{title}</h3>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            color: "var(--text-muted)",
            fontSize: 12,
            padding: "3px 10px",
            cursor: "pointer",
          }}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && children}
    </div>
  );
}

const filterInputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "6px 10px",
  fontSize: 13,
};
