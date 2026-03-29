import { useEffect, useState } from "react";
import {
  createBudget,
  fetchBudget,
  fetchBudgetCategories,
  updateBudget,
} from "../api/client";

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€" };

export interface LineItemFormRow {
  description: string;
  amount: string;
}

export interface CategoryFormRow {
  category: string;
  useLineItems: boolean;
  projectedTotal: string;
  lineItems: LineItemFormRow[];
}

export interface IncomeFormRow {
  description: string;
  amount: string;
  incomeType: string;
}

interface BudgetFormProps {
  budgetId: number | null;
  onSave: () => void;
  onCancel: () => void;
  initialData?: { categories: CategoryFormRow[]; incomeItems: IncomeFormRow[] } | null;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "6px 10px",
  fontSize: 13,
};

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  paddingBottom: 8,
  marginTop: 28,
  marginBottom: 16,
};

const dashedButtonStyle: React.CSSProperties = {
  border: "2px dashed var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  padding: "10px",
  width: "100%",
  borderRadius: "var(--radius)",
  cursor: "pointer",
  fontSize: 13,
};

export default function BudgetForm({ budgetId, onSave, onCancel, initialData }: BudgetFormProps) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [categories, setCategories] = useState<CategoryFormRow[]>([]);
  const [incomeItems, setIncomeItems] = useState<IncomeFormRow[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const cats = await fetchBudgetCategories();
      setAvailableCategories(cats);
      if (budgetId !== null) {
        const budget = await fetchBudget(budgetId);
        setName(budget.name);
        setCurrency(budget.currency);
        setCategories(
          budget.categories.map((c) => ({
            category: c.category,
            useLineItems: c.line_items.length > 0,
            projectedTotal: c.projected_total.toString(),
            lineItems: c.line_items.map((li) => ({
              description: li.description,
              amount: li.amount.toString(),
            })),
          }))
        );
        setIncomeItems(
          budget.income_items.map((i) => ({
            description: i.description,
            amount: i.amount.toString(),
            incomeType: i.income_type,
          }))
        );
      } else if (initialData) {
        setCategories(initialData.categories);
        setIncomeItems(initialData.incomeItems);
      }
      setLoading(false);
    }
    load();
  }, [budgetId]);

  const symbol = CURRENCY_SYMBOLS[currency] || "£";
  const selectedCategories = new Set(categories.map((c) => c.category).filter(Boolean));

  function getCategoryTotal(cat: CategoryFormRow): number {
    if (cat.useLineItems) {
      return cat.lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0);
    }
    return parseFloat(cat.projectedTotal) || 0;
  }

  const totalSpend = categories.reduce((sum, c) => sum + getCategoryTotal(c), 0);
  const totalIncome = incomeItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const surplus = totalIncome - totalSpend;

  function updateCategory(index: number, patch: Partial<CategoryFormRow>) {
    setCategories((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function updateLineItem(catIndex: number, liIndex: number, patch: Partial<LineItemFormRow>) {
    setCategories((prev) =>
      prev.map((c, i) =>
        i === catIndex
          ? { ...c, lineItems: c.lineItems.map((li, j) => (j === liIndex ? { ...li, ...patch } : li)) }
          : c
      )
    );
  }

  function removeLineItem(catIndex: number, liIndex: number) {
    setCategories((prev) =>
      prev.map((c, i) =>
        i === catIndex ? { ...c, lineItems: c.lineItems.filter((_, j) => j !== liIndex) } : c
      )
    );
  }

  function addLineItem(catIndex: number) {
    setCategories((prev) =>
      prev.map((c, i) =>
        i === catIndex ? { ...c, lineItems: [...c.lineItems, { description: "", amount: "" }] } : c
      )
    );
  }

  function removeCategory(index: number) {
    setCategories((prev) => prev.filter((_, i) => i !== index));
  }

  function addCategory() {
    setCategories((prev) => [
      ...prev,
      { category: "", useLineItems: false, projectedTotal: "", lineItems: [] },
    ]);
  }

  function updateIncome(index: number, patch: Partial<IncomeFormRow>) {
    setIncomeItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeIncome(index: number) {
    setIncomeItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addIncome() {
    setIncomeItems((prev) => [...prev, { description: "", amount: "", incomeType: "Income" }]);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError("Budget name is required.");
      return;
    }
    if (categories.length === 0 && incomeItems.length === 0) {
      setError("Add at least one category or income item.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        currency,
        categories: categories.map((c) => ({
          category: c.category,
          projected_total: c.useLineItems
            ? c.lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)
            : parseFloat(c.projectedTotal) || 0,
          line_items: c.useLineItems
            ? c.lineItems.map((li) => ({
                description: li.description,
                amount: parseFloat(li.amount) || 0,
              }))
            : [],
        })),
        income_items: incomeItems.map((i) => ({
          description: i.description,
          amount: parseFloat(i.amount) || 0,
          income_type: i.incomeType,
        })),
      };
      if (budgetId === null) {
        await createBudget(payload);
      } else {
        await updateBudget(budgetId, payload);
      }
      onSave();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setSaving(false);
    }
  }

  if (loading) {
    return <p style={{ color: "var(--text-muted)" }}>Loading...</p>;
  }

  return (
    <div>
      <button
        onClick={onCancel}
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
        &lt; Back
      </button>

      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        {budgetId === null ? "Create Budget" : "Edit Budget"}
      </h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
          Budget Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
        />
        {error && error.includes("name") && (
          <p style={{ color: "var(--danger)", fontSize: 12, marginTop: 4 }}>{error}</p>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>
          Currency
        </label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={inputStyle}
        >
          <option value="GBP">GBP</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
      </div>

      <div style={sectionHeaderStyle}>Spending Categories</div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
      {categories.map((cat, catIndex) => {
        const catTotal = getCategoryTotal(cat);
        const pct = totalSpend > 0 ? ((catTotal / totalSpend) * 100).toFixed(1) : "0.0";
        const optionsForThisRow = availableCategories.filter(
          (c) => c === cat.category || !selectedCategories.has(c)
        );

        return (
          <div
            key={catIndex}
            style={{
              flex: "1 1 300px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <select
                value={cat.category}
                onChange={(e) => updateCategory(catIndex, { category: e.target.value })}
                style={inputStyle}
              >
                <option value="">Select category</option>
                {optionsForThisRow.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={() => removeCategory(catIndex)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--danger)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>

            <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={!cat.useLineItems}
                  onChange={() => updateCategory(catIndex, { useLineItems: false })}
                />
                Flat total
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                <input
                  type="radio"
                  checked={cat.useLineItems}
                  onChange={() => updateCategory(catIndex, { useLineItems: true })}
                />
                Line items
              </label>
            </div>

            {!cat.useLineItems && (
              <div>
                <label style={{ display: "block", fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
                  Projected total
                </label>
                <input
                  type="number"
                  value={cat.projectedTotal}
                  onChange={(e) => updateCategory(catIndex, { projectedTotal: e.target.value })}
                  placeholder="0.00"
                  style={inputStyle}
                />
              </div>
            )}

            {cat.useLineItems && (
              <div>
                {cat.lineItems.map((li, liIndex) => (
                  <div key={liIndex} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <input
                      type="text"
                      value={li.description}
                      onChange={(e) => updateLineItem(catIndex, liIndex, { description: e.target.value })}
                      placeholder="Description"
                      style={{ ...inputStyle, flex: 2 }}
                    />
                    <input
                      type="number"
                      value={li.amount}
                      onChange={(e) => updateLineItem(catIndex, liIndex, { amount: e.target.value })}
                      placeholder="0.00"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      onClick={() => removeLineItem(catIndex, liIndex)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--danger)",
                        fontSize: 13,
                        cursor: "pointer",
                      }}
                    >
                      x
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addLineItem(catIndex)}
                  style={{ ...dashedButtonStyle, marginBottom: 8 }}
                >
                  + Add line item
                </button>
              </div>
            )}

            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>
              Category total: {symbol}{catTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
              <span>({pct}% of total)</span>
            </div>
          </div>
        );
      })}
      </div>

      <button onClick={addCategory} style={dashedButtonStyle}>
        + Add Category
      </button>

      <div style={sectionHeaderStyle}>Money In</div>

      {incomeItems.map((item, index) => (
        <div key={index} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <input
            type="text"
            value={item.description}
            onChange={(e) => updateIncome(index, { description: e.target.value })}
            placeholder="Description"
            style={{ ...inputStyle, flex: 2 }}
          />
          <input
            type="number"
            value={item.amount}
            onChange={(e) => updateIncome(index, { amount: e.target.value })}
            placeholder="0.00"
            style={{ ...inputStyle, flex: 1 }}
          />
          <select
            value={item.incomeType}
            onChange={(e) => updateIncome(index, { incomeType: e.target.value })}
            style={inputStyle}
          >
            <option value="Income">Income</option>
            <option value="Money From Friends">Money From Friends</option>
            <option value="Other">Other</option>
          </select>
          <button
            onClick={() => removeIncome(index)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--danger)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            x
          </button>
        </div>
      ))}

      <button onClick={addIncome} style={dashedButtonStyle}>
        + Add Income Item
      </button>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 16,
          marginTop: 24,
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          Total projected spending:{" "}
          <strong>{symbol}{totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          Total projected income:{" "}
          <strong>{symbol}{totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
        </div>
        <div style={{ fontSize: 13 }}>
          Projected surplus:{" "}
          <strong style={{ color: surplus >= 0 ? "var(--success)" : "var(--danger)" }}>
            {symbol}{Math.abs(surplus).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            {surplus < 0 ? " (deficit)" : ""}
          </strong>
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{error}</p>
      )}

      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "7px 16px",
            borderRadius: "var(--radius)",
            background: "var(--primary)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer",
            border: "none",
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? "Saving..." : "Save Budget"}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: "7px 16px",
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
