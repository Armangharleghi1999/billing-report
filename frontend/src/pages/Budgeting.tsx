import { useState } from "react";
import {
  deleteBudget,
  fetchBudgets,
  fetchBudgetTemplate,
  type BudgetSummaryOut,
} from "../api/client";
import BudgetComparison from "../components/BudgetComparison";
import BudgetCreateChoice from "../components/BudgetCreateChoice";
import BudgetForm, { type CategoryFormRow, type IncomeFormRow } from "../components/BudgetForm";
import { useFetch } from "../hooks/useFetch";

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Budgeting() {
  const [view, setView] = useState<"list" | "choice" | "form" | "compare">("list");
  const [editingBudgetId, setEditingBudgetId] = useState<number | null>(null);
  const [comparingBudgetId, setComparingBudgetId] = useState<number | null>(null);
  const [templateData, setTemplateData] = useState<{
    categories: CategoryFormRow[];
    incomeItems: IncomeFormRow[];
  } | null>(null);

  const { data: budgets, loading, error, refetch } = useFetch(fetchBudgets);

  if (view === "choice") {
    return (
      <BudgetCreateChoice
        onChooseBlank={() => {
          setTemplateData(null);
          setView("form");
        }}
        onChooseTemplate={async () => {
          try {
            const tmpl = await fetchBudgetTemplate();
            if (tmpl.months_analyzed === 0 || tmpl.categories.length === 0) {
              alert("Not enough transaction history to auto-generate a budget. Opening blank form.");
              setTemplateData(null);
              setView("form");
              return;
            }
            setTemplateData({
              categories: tmpl.categories.map((cat) => ({
                category: cat.category,
                useLineItems: true,
                projectedTotal: "",
                lineItems: cat.line_items.map((li) => ({
                  description: li.merchant,
                  amount: li.median_amount,
                })),
              })),
              incomeItems: [],
            });
            setView("form");
          } catch {
            alert("Failed to fetch budget template. Opening blank form.");
            setTemplateData(null);
            setView("form");
          }
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "form") {
    return (
      <BudgetForm
        budgetId={editingBudgetId}
        initialData={templateData}
        onSave={() => {
          setView("list");
          refetch();
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "compare") {
    return (
      <BudgetComparison
        budgetId={comparingBudgetId!}
        onBack={() => setView("list")}
      />
    );
  }

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
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Budgeting</h2>
        {budgets && budgets.length > 0 && (
          <button
            onClick={() => {
              setEditingBudgetId(null);
              setView("choice");
            }}
            style={{
              padding: "8px 18px",
              borderRadius: "var(--radius)",
              background: "var(--primary)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              border: "none",
            }}
          >
            Create Budget
          </button>
        )}
      </div>

      {loading && (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      )}
      {error && (
        <p style={{ color: "var(--danger)" }}>{error}</p>
      )}

      {!loading && !error && budgets && budgets.length === 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: 300,
          }}
        >
          <button
            onClick={() => {
              setEditingBudgetId(null);
              setView("choice");
            }}
            style={{
              padding: "12px 24px",
              borderRadius: "var(--radius)",
              background: "var(--primary)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
            }}
          >
            Create Budget
          </button>
        </div>
      )}

      {!loading && !error && budgets && budgets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {budgets.map((b) => (
            <BudgetCard
              key={b.id}
              budget={b}
              onEdit={() => {
                setEditingBudgetId(b.id);
                setView("form");
              }}
              onCompare={() => {
                setComparingBudgetId(b.id);
                setView("compare");
              }}
              onDelete={async () => {
                if (!window.confirm("Delete this budget?")) return;
                await deleteBudget(b.id);
                refetch();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetCard({
  budget,
  onEdit,
  onCompare,
  onDelete,
}: {
  budget: BudgetSummaryOut;
  onEdit: () => void;
  onCompare: () => void;
  onDelete: () => void;
}) {
  const symbol = CURRENCY_SYMBOLS[budget.currency] || "£";

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        padding: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 16 }}>{budget.name}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
          Last edited: {formatDate(budget.updated_at)}
        </span>
      </div>
      <div style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 14 }}>
        {budget.category_count} categories &bull;{" "}
        {symbol}{Number(budget.total_projected).toLocaleString(undefined, { minimumFractionDigits: 2 })} projected &bull;{" "}
        {symbol}{Number(budget.total_income).toLocaleString(undefined, { minimumFractionDigits: 2 })} income
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={onEdit}
          style={{
            padding: "6px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--primary)",
            background: "transparent",
            color: "var(--primary)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Edit Budget
        </button>
        <button
          onClick={onCompare}
          style={{
            padding: "6px 14px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Compare
        </button>
        <button
          onClick={onDelete}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--danger)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
