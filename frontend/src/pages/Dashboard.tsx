import { useEffect, useMemo, useState } from "react";
import {
  clearAllData,
  recategoriseTransactions,
  fetchImportHistory,
  fetchIncomeVsExpenses,
  fetchMerchantBreakdown,
  fetchMonthlySpend,
  fetchSpendingFlow,
  fetchSummary,
  type StatementOut,
} from "../api/client";
import CategoryMonthTable from "../components/charts/CategoryMonthTable";
import CategoryPieChart from "../components/charts/CategoryPieChart";
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Compute the default date range from imported statement date ranges.
 *  If both AMEX and Chase are present, intersect their ranges and snap to whole calendar months.
 *  If only one source, return null (show all data). */
function computeDefaultDateRange(
  statements: StatementOut[]
): { start: string; end: string } | null {
  const amex = statements.filter((s) => s.source === "amex");
  const chase = statements.filter((s) => s.source === "chase");

  if (amex.length === 0 || chase.length === 0) return null;

  const dates = (stmts: StatementOut[]) => {
    const starts = stmts.map((s) => s.period_start).filter(Boolean) as string[];
    const ends = stmts.map((s) => s.period_end).filter(Boolean) as string[];
    if (starts.length === 0 || ends.length === 0) return null;
    return { min: starts.sort()[0], max: ends.sort().reverse()[0] };
  };

  const amexRange = dates(amex);
  const chaseRange = dates(chase);
  if (!amexRange || !chaseRange) return null;

  // Intersection of the two ranges
  const overlapStart = amexRange.min > chaseRange.min ? amexRange.min : chaseRange.min;
  const overlapEnd = amexRange.max < chaseRange.max ? amexRange.max : chaseRange.max;

  if (overlapStart >= overlapEnd) return null;

  // Snap to whole calendar months contained within the overlap
  // First complete month: first day of the first month where month_start >= overlapStart
  const os = new Date(overlapStart + "T00:00:00");
  let firstMonth: Date;
  if (os.getDate() === 1) {
    firstMonth = new Date(os.getFullYear(), os.getMonth(), 1);
  } else {
    // Move to first day of next month
    firstMonth = new Date(os.getFullYear(), os.getMonth() + 1, 1);
  }

  // Last complete month: last day of the last month where month_end <= overlapEnd
  const oe = new Date(overlapEnd + "T00:00:00");
  const lastDayOfMonth = new Date(oe.getFullYear(), oe.getMonth() + 1, 0);
  let lastMonth: Date;
  if (oe >= lastDayOfMonth) {
    // The overlap end covers the full month
    lastMonth = lastDayOfMonth;
  } else {
    // Move to last day of previous month
    lastMonth = new Date(oe.getFullYear(), oe.getMonth(), 0);
  }

  if (firstMonth > lastMonth) return null;

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { start: fmt(firstMonth), end: fmt(lastMonth) };
}

export default function Dashboard() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  const [clearing, setClearing] = useState(false);
  const [recategorising, setRecategorising] = useState(false);

  const categoryTableStart = useMemo(() => threeMonthsAgo(), []);

  // Fetch import history to compute smart default date range
  useEffect(() => {
    if (defaultsApplied) return;
    fetchImportHistory()
      .then((statements) => {
        const range = computeDefaultDateRange(statements);
        if (range) {
          setStartDate(range.start);
          setEndDate(range.end);
        }
        setDefaultsApplied(true);
      })
      .catch(() => setDefaultsApplied(true));
  }, [defaultsApplied]);

  const { data: summary, loading: summaryLoading } = useFetch(fetchSummary);
  const { data: monthlySpend } = useFetch(
    () => fetchMonthlySpend(startDate || undefined, endDate || undefined),
    [startDate, endDate]
  );
  const { data: incomeVsExp } = useFetch(fetchIncomeVsExpenses);
  const { data: merchants } = useFetch(
    () =>
      fetchMerchantBreakdown(startDate || undefined, endDate || undefined),
    [startDate, endDate]
  );
  const { data: categoryTableData, refetch: refetchCategoryTable } = useFetch(
    () => fetchMonthlySpend(categoryTableStart, undefined),
    [categoryTableStart]
  );
  const { data: spendingFlow } = useFetch(
    () => fetchSpendingFlow(startDate || undefined, endDate || undefined),
    [startDate, endDate]
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
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={filterInputStyle}
          />
          <label style={{ fontSize: 13, color: "var(--text-muted)" }}>To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={filterInputStyle}
          />
          <button
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            style={{
              padding: "6px 12px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-muted)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reset
          </button>
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

      {/* Row 2: Spending by Category Pie Chart */}
      <CollapsibleCard title="Spending by Category" style={{ marginBottom: 24 }}>
        <CategoryPieChart />
      </CollapsibleCard>

      {/* Row 3: Unspent Money (full width) */}
      <CollapsibleCard title="Unspent Money per Month" style={{ marginBottom: 24 }}>
        <UnspentMoney data={incomeVsExp ?? []} />
      </CollapsibleCard>

      {/* Row 4: Top Merchants (collapsed by default) */}
      <CollapsibleCard title="Top Merchants" defaultOpen={false} style={{ marginBottom: 24 }}>
        <MerchantBreakdownChart data={merchants ?? []} />
      </CollapsibleCard>

      {/* Row 5: Spending Flow (Sankey) */}
      <CollapsibleCard title="Spending Flow" defaultOpen={false} style={{ marginBottom: 24 }}>
        {spendingFlow ? (
          <SpendingFlowChart data={spendingFlow} />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        )}
      </CollapsibleCard>

      {/* Row 6: Category x Month Table */}
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
