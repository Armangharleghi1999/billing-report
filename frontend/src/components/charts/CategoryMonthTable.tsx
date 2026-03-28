import { useCallback, useEffect, useMemo, useState } from "react";
import {
  applyRuleChanges,
  bulkUpdateTransactions,
  fetchMerchantNotes,
  fetchTransactions,
  previewRuleChanges,
  saveMerchantNotes,
  type MonthlySpend,
  type RulePreviewItem,
  type RulePatch,
  type TransactionOut,
} from "../../api/client";

const CATEGORIES = [
  "Groceries",
  "Takeaway",
  "Subscriptions",
  "Transport",
  "Shopping",
  "Health & Wellness",
  "To Friends & Family",
  "Coffee & Snacks",
  "Income",
  "Dining Out",
  "Pubs & Bars",
  "Telecoms",
  "Utilities",
  "Housing",
  "Rent and Bills",
  "Entertainment",
  "Books & Education",
  "Personal Care",
  "Transfers",
  "Money From Friends",
  "Savings",
  "Investments",
  "Travel",
  "Payment",
  "Other",
];

interface Props {
  data: MonthlySpend[];
  onDataChanged?: () => void;
}

interface DrillKey {
  category: string;
  month: string;
}

type PendingChange = { txn: TransactionOut; newCategory: string };

interface RulePatchUI {
  item: RulePreviewItem;
  pattern: string;
  skip: boolean;
}

interface NoteConflict {
  merchant: string;
  existing: string;
  pending: string;
}

function formatMonth(m: string) {
  const [year, month] = m.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleString("default", {
    month: "short",
    year: "numeric",
  });
}

function fmt(n: number) {
  return `£${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function monthDateRange(month: string): { start: string; end: string } {
  const [year, mon] = month.split("-").map(Number);
  const start = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const end = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function CategoryMonthTable({ data, onDataChanged }: Props) {
  const [drill, setDrill] = useState<DrillKey | null>(null);
  const [drillData, setDrillData] = useState<TransactionOut[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<DrillKey | null>(null);

  // Pending category changes
  const [pendingChanges, setPendingChanges] = useState<Map<number, PendingChange>>(new Map());

  // Pending merchant note changes (keyed by merchant name)
  const [pendingMerchantNotes, setPendingMerchantNotes] = useState<Map<string, string>>(new Map());
  const [existingNotes, setExistingNotes] = useState<Record<string, string>>({});

  // Conflict resolution
  const [noteConflicts, setNoteConflicts] = useState<NoteConflict[]>([]);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, string>>({});

  // Rules panel
  const [rulePatchUI, setRulePatchUI] = useState<RulePatchUI[]>([]);
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);

  useEffect(() => {
    fetchMerchantNotes().then(setExistingNotes);
  }, []);

  const effectiveNote = (merchant: string | null): string => {
    if (!merchant) return "";
    if (pendingMerchantNotes.has(merchant)) return pendingMerchantNotes.get(merchant)!;
    return existingNotes[merchant] ?? "";
  };

  const handleMerchantNoteChange = (merchant: string | null, note: string) => {
    if (!merchant) return;
    const existing = existingNotes[merchant] ?? "";
    setPendingMerchantNotes((prev) => {
      const next = new Map(prev);
      if (note === existing) {
        next.delete(merchant);
      } else {
        next.set(merchant, note);
      }
      return next;
    });
  };

  const { months, categories, cell, categoryTotals, colTotals, grandTotal } =
    useMemo(() => {
      const monthSet = new Set<string>();
      const categoryTotals: Record<string, number> = {};
      const cell: Record<string, Record<string, number>> = {};

      for (const row of data) {
        monthSet.add(row.month);
        const amt = Number(row.total);
        categoryTotals[row.category] = (categoryTotals[row.category] ?? 0) + amt;
        if (!cell[row.category]) cell[row.category] = {};
        cell[row.category][row.month] = (cell[row.category][row.month] ?? 0) + amt;
      }

      const months = [...monthSet].sort();
      const categories = Object.keys(categoryTotals).sort(
        (a, b) => categoryTotals[b] - categoryTotals[a]
      );

      const colTotals: Record<string, number> = {};
      for (const m of months) {
        colTotals[m] = categories.reduce((s, c) => s + (cell[c]?.[m] ?? 0), 0);
      }
      const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0);

      return { months, categories, cell, categoryTotals, colTotals, grandTotal };
    }, [data]);

  const loadDrill = useCallback(async (category: string, month: string) => {
    setDrillLoading(true);
    try {
      const { start, end } = monthDateRange(month);
      const result = await fetchTransactions({
        category,
        start_date: start,
        end_date: end,
        sort_by: "amount",
        sort_order: "desc",
        page_size: 50,
      });
      setDrillData(result.items);
    } finally {
      setDrillLoading(false);
    }
  }, []);

  const handleCellClick = (cat: string, month: string, value: number) => {
    if (value === 0) return;
    if (drill?.category === cat && drill?.month === month) {
      setDrill(null);
      setDrillData([]);
      return;
    }
    setDrill({ category: cat, month });
    loadDrill(cat, month);
  };

  const handleCategoryChange = (txn: TransactionOut, newCat: string) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const existing = next.get(txn.id);
      const original = existing ? existing.txn : txn;
      if (newCat === original.category) {
        next.delete(txn.id);
      } else {
        next.set(txn.id, { txn: original, newCategory: newCat });
      }
      return next;
    });
    setDrillData((prev) =>
      prev.map((t) => (t.id === txn.id ? { ...t, category: newCat } : t))
    );
  };

  const handleUpdateDetails = async () => {
    const totalPending = pendingChanges.size + pendingMerchantNotes.size;
    if (totalPending === 0) return;

    // Check for conflicts: pending note differs from already-saved note
    const conflicts: NoteConflict[] = [];
    for (const [merchant, newNote] of pendingMerchantNotes.entries()) {
      const existing = existingNotes[merchant];
      if (existing !== undefined && existing !== newNote) {
        conflicts.push({ merchant, existing, pending: newNote });
      }
    }

    if (conflicts.length > 0) {
      const resolutions: Record<string, string> = {};
      conflicts.forEach((c) => { resolutions[c.merchant] = c.pending; });
      setConflictResolutions(resolutions);
      setNoteConflicts(conflicts);
      setShowConflictPanel(true);
      return;
    }

    await doSave();
  };

  const doSave = async (overrideResolutions?: Record<string, string>) => {
    setSaving(true);
    try {
      // Save categories
      if (pendingChanges.size > 0) {
        const changes = [...pendingChanges.values()];
        await bulkUpdateTransactions(
          changes.map((c) => ({ id: c.txn.id, category: c.newCategory }))
        );
        const preview = await previewRuleChanges(
          changes.map((c) => ({
            description: c.txn.description,
            new_category: c.newCategory,
          }))
        );
        const uiItems: RulePatchUI[] = preview.items.map((item) => ({
          item,
          pattern: item.suggested_pattern,
          skip: item.existing_rule_category === item.new_category,
        }));
        setRulePatchUI(uiItems);
        setShowRulesPanel(true);
      }

      // Save merchant notes (apply conflict resolutions)
      const finalNotes = new Map(pendingMerchantNotes);
      if (overrideResolutions) {
        Object.entries(overrideResolutions).forEach(([m, n]) => finalNotes.set(m, n));
      }
      if (finalNotes.size > 0) {
        const items = [...finalNotes.entries()].map(([merchant, note]) => ({ merchant, note }));
        await saveMerchantNotes(items);
        setExistingNotes((prev) => ({
          ...prev,
          ...Object.fromEntries(finalNotes.entries()),
        }));
      }

      setPendingChanges(new Map());
      setPendingMerchantNotes(new Map());
      setShowConflictPanel(false);
      onDataChanged?.();
    } finally {
      setSaving(false);
    }
  };

  const handleApplyRules = async () => {
    setApplyingRules(true);
    try {
      const patches: RulePatch[] = rulePatchUI
        .filter((r) => !r.skip)
        .map((r) => ({
          pattern: r.pattern,
          category: r.item.new_category,
          existing_rule_id: r.item.existing_rule_id,
        }));
      if (patches.length > 0) {
        await applyRuleChanges(patches);
      }
      setShowRulesPanel(false);
    } finally {
      setApplyingRules(false);
    }
  };

  if (!data.length) {
    return (
      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
        No data for this period
      </p>
    );
  }

  const pendingCount = pendingChanges.size + pendingMerchantNotes.size;

  return (
    <div>
      {/* Pending changes banner */}
      {pendingCount > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
            padding: "10px 14px",
            background: "rgba(34,197,94,0.08)",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: "var(--radius)",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {pendingCount} unsaved change{pendingCount > 1 ? "s" : ""}
          </span>
          <button
            onClick={handleUpdateDetails}
            disabled={saving}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius)",
              border: "none",
              background: "#22c55e",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving
              ? "Saving\u2026"
              : pendingCount === 1
              ? "Update Transaction Details (1)"
              : `Update Transactions Details (${pendingCount})`}
          </button>
        </div>
      )}

      {/* Main pivot table */}
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left" }}>Category</th>
              {months.map((m) => (
                <th key={m} style={thStyle}>
                  {formatMonth(m)}
                </th>
              ))}
              <th style={{ ...thStyle, color: "var(--text)" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat, i) => (
              <tr
                key={cat}
                style={{
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                }}
              >
                <td style={{ ...tdStyle, textAlign: "left" }}>{cat}</td>
                {months.map((m) => {
                  const v = cell[cat]?.[m] ?? 0;
                  const isSelected = drill?.category === cat && drill?.month === m;
                  const isHovered = hoveredCell?.category === cat && hoveredCell?.month === m;
                  return (
                    <td
                      key={m}
                      onClick={() => handleCellClick(cat, m, v)}
                      onMouseEnter={() => v > 0 && setHoveredCell({ category: cat, month: m })}
                      onMouseLeave={() => setHoveredCell(null)}
                      style={{
                        ...tdStyle,
                        cursor: v > 0 ? "pointer" : "default",
                        color: v === 0 ? "var(--text-muted)" : "var(--text)",
                        background: isSelected
                          ? "rgba(99,102,241,0.2)"
                          : isHovered
                          ? "rgba(255,255,255,0.06)"
                          : "transparent",
                        borderRadius: 4,
                        transition: "background 0.1s",
                      }}
                    >
                      {v === 0 ? "\u2014" : fmt(v)}
                    </td>
                  );
                })}
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmt(categoryTotals[cat])}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td style={{ ...tfStyle, textAlign: "left" }}>Total</td>
              {months.map((m) => (
                <td key={m} style={tfStyle}>
                  {fmt(colTotals[m])}
                </td>
              ))}
              <td style={tfStyle}>{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Drill-down panel */}
      {drill && (
        <div
          style={{
            marginTop: 20,
            borderTop: "1px solid var(--border)",
            paddingTop: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{drill.category}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 13, marginLeft: 8 }}>
                {formatMonth(drill.month)}
              </span>
            </div>
            <button
              onClick={() => {
                setDrill(null);
                setDrillData([]);
              }}
              style={closeBtnStyle}
            >
              ✕
            </button>
          </div>

          {drillLoading ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</p>
          ) : drillData.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No transactions found.</p>
          ) : (
            <table style={{ ...tableStyle, fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, textAlign: "left" }}>Date</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Description</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Merchant</th>
                  <th style={thStyle}>Amount</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Category</th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Merchant Details</th>
                </tr>
              </thead>
              <tbody>
                {drillData.map((txn, i) => {
                  const isPending = pendingChanges.has(txn.id);
                  const note = effectiveNote(txn.merchant);
                  const isNotePending =
                    txn.merchant !== null && pendingMerchantNotes.has(txn.merchant);
                  return (
                    <tr
                      key={txn.id}
                      style={{
                        background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                        borderLeft: isPending ? "3px solid #22c55e" : "3px solid transparent",
                      }}
                    >
                      <td style={{ ...tdStyle, textAlign: "left", whiteSpace: "nowrap" }}>
                        {txn.date}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "left",
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={txn.description}
                      >
                        {txn.description}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "left",
                          cursor: note ? "help" : "default",
                          whiteSpace: "nowrap",
                        }}
                        title={note || undefined}
                      >
                        {txn.merchant ?? "—"}
                        {note && !isNotePending && (
                          <span
                            style={{
                              marginLeft: 5,
                              fontSize: 10,
                              color: "var(--primary)",
                              opacity: 0.8,
                            }}
                          >
                            ●
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          color: txn.is_credit ? "var(--success)" : "var(--text)",
                        }}
                      >
                        {txn.is_credit ? "+" : ""}
                        {fmt(txn.amount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "left" }}>
                        <select
                          value={txn.category ?? ""}
                          onChange={(e) => handleCategoryChange(txn, e.target.value)}
                          style={{
                            ...selectStyle,
                            color: isPending ? "#22c55e" : "var(--text)",
                            fontWeight: isPending ? 600 : 400,
                          }}
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "left" }}>
                        {txn.merchant ? (
                          <input
                            type="text"
                            value={note}
                            placeholder="Add details…"
                            onChange={(e) =>
                              handleMerchantNoteChange(txn.merchant, e.target.value)
                            }
                            style={{
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              color: isNotePending ? "#22c55e" : "var(--text)",
                              fontWeight: isNotePending ? 600 : 400,
                              fontSize: 12,
                              padding: "3px 6px",
                              width: 160,
                            }}
                          />
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Merchant note conflict panel */}
      {showConflictPanel && noteConflicts.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: "20px 24px",
            background: "var(--bg-card)",
            border: "1px solid rgba(234,179,8,0.4)",
            borderRadius: "var(--radius)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              Merchant detail conflict{noteConflicts.length > 1 ? "s" : ""}
            </h4>
            <button onClick={() => setShowConflictPanel(false)} style={closeBtnStyle}>
              ✕
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            The following merchants already have saved details. Choose which version to keep.
          </p>
          <table style={{ ...tableStyle, fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Merchant</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Saved</th>
                <th style={{ ...thStyle, textAlign: "left" }}>New</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Keep</th>
              </tr>
            </thead>
            <tbody>
              {noteConflicts.map((conflict, i) => (
                <tr
                  key={conflict.merchant}
                  style={{
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <td style={{ ...tdStyle, textAlign: "left", fontWeight: 600 }}>
                    {conflict.merchant}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left", color: "var(--text-muted)" }}>
                    {conflict.existing}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left", color: "#22c55e" }}>
                    {conflict.pending}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name={`conflict-${conflict.merchant}`}
                          checked={conflictResolutions[conflict.merchant] === conflict.existing}
                          onChange={() =>
                            setConflictResolutions((prev) => ({
                              ...prev,
                              [conflict.merchant]: conflict.existing,
                            }))
                          }
                        />
                        Saved
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                        <input
                          type="radio"
                          name={`conflict-${conflict.merchant}`}
                          checked={conflictResolutions[conflict.merchant] === conflict.pending}
                          onChange={() =>
                            setConflictResolutions((prev) => ({
                              ...prev,
                              [conflict.merchant]: conflict.pending,
                            }))
                          }
                        />
                        New
                      </label>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => doSave(conflictResolutions)}
              disabled={saving}
              style={{
                padding: "7px 18px",
                borderRadius: "var(--radius)",
                border: "none",
                background: "#22c55e",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? "Saving\u2026" : "Save with these choices"}
            </button>
            <button onClick={() => setShowConflictPanel(false)} style={closeBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rules confirmation panel */}
      {showRulesPanel && (
        <div
          style={{
            marginTop: 24,
            padding: "20px 24px",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
              Save categorisation rules?
            </h4>
            <button
              onClick={() => setShowRulesPanel(false)}
              style={closeBtnStyle}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            These rules will be saved so future transactions are auto-categorised.
            Edit patterns or uncheck to skip.
          </p>

          <table style={{ ...tableStyle, fontSize: 12, marginBottom: 16 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left", width: 24 }}></th>
                <th style={{ ...thStyle, textAlign: "left" }}>Description</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Pattern</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Category</th>
                <th style={{ ...thStyle, textAlign: "left" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rulePatchUI.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    opacity: row.skip ? 0.4 : 1,
                    background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={!row.skip}
                      onChange={(e) =>
                        setRulePatchUI((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, skip: !e.target.checked } : r
                          )
                        )
                      }
                    />
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "left",
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={row.item.description}
                  >
                    {row.item.description}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    <input
                      type="text"
                      value={row.pattern}
                      onChange={(e) =>
                        setRulePatchUI((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, pattern: e.target.value } : r
                          )
                        )
                      }
                      disabled={row.skip}
                      style={{
                        background: "var(--bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        color: "var(--text)",
                        fontSize: 12,
                        padding: "3px 6px",
                        width: 180,
                        fontFamily: "monospace",
                      }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left", color: "#22c55e", fontWeight: 600 }}>
                    {row.item.new_category}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    {row.item.existing_rule_id !== null ? (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(234,179,8,0.15)",
                          color: "#eab308",
                          fontWeight: 600,
                        }}
                      >
                        UPDATE
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(34,197,94,0.15)",
                          color: "#22c55e",
                          fontWeight: 600,
                        }}
                      >
                        ADD NEW
                      </span>
                    )}
                    {row.item.existing_rule_category === row.item.new_category && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: "var(--text-muted)",
                        }}
                      >
                        (already correct)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleApplyRules}
              disabled={applyingRules || rulePatchUI.every((r) => r.skip)}
              style={{
                padding: "7px 18px",
                borderRadius: "var(--radius)",
                border: "none",
                background: "#22c55e",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: applyingRules ? "not-allowed" : "pointer",
                opacity: applyingRules || rulePatchUI.every((r) => r.skip) ? 0.5 : 1,
              }}
            >
              {applyingRules ? "Saving\u2026" : "Save Rules"}
            </button>
            <button
              onClick={() => setShowRulesPanel(false)}
              style={closeBtnStyle}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "8px 14px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontWeight: 500,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "8px 14px",
  borderBottom: "1px solid var(--border)",
};

const tfStyle: React.CSSProperties = {
  textAlign: "right",
  padding: "10px 14px",
  fontWeight: 700,
  color: "var(--text)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 13,
  padding: "4px 10px",
};

const selectStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontSize: 12,
  padding: "3px 6px",
  cursor: "pointer",
};
