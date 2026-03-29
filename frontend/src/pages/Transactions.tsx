import { useEffect, useState } from "react";
import {
  bulkUpdateTransactions,
  deleteTransaction,
  fetchMerchantNotes,
  fetchTransactions,
  saveMerchantNotes,
  type TransactionOut,
} from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useCategories } from "../hooks/useCategories";

type SortBy = "date" | "description" | "merchant" | "amount" | "category";
type SortOrder = "asc" | "desc";

interface NoteConflict {
  merchant: string;
  existing: string;
  pending: string;
}

export default function Transactions() {
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Deferred-save state
  const [pendingCategories, setPendingCategories] = useState<
    Map<number, { txn: TransactionOut; newCategory: string }>
  >(new Map());
  const [pendingMerchantNotes, setPendingMerchantNotes] = useState<Map<string, string>>(new Map());
  const [existingNotes, setExistingNotes] = useState<Record<string, string>>({});

  // Conflict resolution state
  const [noteConflicts, setNoteConflicts] = useState<NoteConflict[]>([]);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const { data: categoriesData } = useCategories();
  const categories = categoriesData ?? [];

  const { data, loading, refetch } = useFetch(
    () =>
      fetchTransactions({
        page,
        page_size: 50,
        category: category || undefined,
        search: search || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    [page, category, search, startDate, endDate, sortBy, sortOrder]
  );

  useEffect(() => {
    fetchMerchantNotes().then(setExistingNotes);
  }, []);

  const effectiveNote = (merchant: string | null): string => {
    if (!merchant) return "";
    if (pendingMerchantNotes.has(merchant)) return pendingMerchantNotes.get(merchant)!;
    return existingNotes[merchant] ?? "";
  };

  const handleSort = (col: SortBy) => {
    if (col === sortBy) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
    setPage(1);
  };

  const sortIndicator = (col: SortBy) => {
    if (col !== sortBy) return null;
    return <span style={{ marginLeft: 4 }}>{sortOrder === "asc" ? "▲" : "▼"}</span>;
  };

  const handleCategoryChange = (txn: TransactionOut, newCat: string) => {
    setPendingCategories((prev) => {
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

  const handleSave = async () => {
    const totalPending = pendingCategories.size + pendingMerchantNotes.size;
    if (totalPending === 0) return;

    // Check for conflicts
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
      if (pendingCategories.size > 0) {
        const changes = [...pendingCategories.values()];
        await bulkUpdateTransactions(
          changes.map((c) => ({ id: c.txn.id, category: c.newCategory }))
        );
      }

      // Save merchant notes
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

      setPendingCategories(new Map());
      setPendingMerchantNotes(new Map());
      setShowConflictPanel(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this transaction?")) return;
    await deleteTransaction(id);
    refetch();
  };

  const pendingCount = pendingCategories.size + pendingMerchantNotes.size;

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        Transactions
      </h2>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={inputStyle}
        />
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          style={inputStyle}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setPage(1);
          }}
          style={inputStyle}
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setPage(1);
          }}
          style={inputStyle}
        />
      </div>

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
            onClick={handleSave}
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

      {/* Conflict panel */}
      {showConflictPanel && noteConflicts.length > 0 && (
        <div
          style={{
            marginBottom: 16,
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
            <button
              onClick={() => setShowConflictPanel(false)}
              style={closeBtnStyle}
            >
              ✕
            </button>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            The following merchants already have saved details. Choose which version to keep.
          </p>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}
          >
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
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
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
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
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

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : !data?.items.length ? (
        <p style={{ color: "var(--text-muted)" }}>
          No transactions found. Upload a statement first.
        </p>
      ) : (
        <>
          <div
            style={{
              overflowX: "auto",
              background: "var(--bg-card)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead>
                <tr>
                  {(
                    [
                      { key: "date", label: "Date" },
                      { key: "description", label: "Description" },
                      { key: "merchant", label: "Merchant" },
                      { key: "amount", label: "Amount" },
                      { key: "category", label: "Category" },
                    ] as { key: SortBy; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={key}
                      style={{
                        ...thStyle,
                        cursor: "pointer",
                        userSelect: "none",
                        color: sortBy === key ? "var(--text)" : "var(--text-muted)",
                      }}
                      onClick={() => handleSort(key)}
                    >
                      {label}
                      {sortIndicator(key)}
                    </th>
                  ))}
                  <th style={thStyle}>Merchant Details</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((txn) => {
                  const pendingCat = pendingCategories.get(txn.id);
                  const displayCategory = pendingCat?.newCategory ?? txn.category ?? "Other";
                  const isCatPending = pendingCategories.has(txn.id);
                  const note = effectiveNote(txn.merchant);
                  const isNotePending =
                    txn.merchant !== null && pendingMerchantNotes.has(txn.merchant);

                  return (
                    <tr
                      key={txn.id}
                      style={{ transition: "background 0.1s" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={tdStyle}>{txn.date}</td>
                      <td style={tdStyle}>{txn.description}</td>
                      <td style={tdStyle}>{txn.merchant ?? "—"}</td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "right",
                          color: txn.is_credit ? "var(--success)" : "var(--text)",
                          fontWeight: 500,
                        }}
                      >
                        {txn.is_credit ? "+" : "-"}£
                        {Number(txn.amount).toFixed(2)}
                      </td>
                      <td style={tdStyle}>
                        <select
                          value={displayCategory}
                          onChange={(e) => handleCategoryChange(txn, e.target.value)}
                          style={{
                            ...inputStyle,
                            padding: "4px 8px",
                            fontSize: 12,
                            color: isCatPending ? "#22c55e" : "var(--text)",
                            fontWeight: isCatPending ? 600 : 400,
                          }}
                        >
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdStyle}>
                        {txn.merchant ? (
                          <input
                            type="text"
                            value={note}
                            placeholder="Add details…"
                            onChange={(e) =>
                              handleMerchantNoteChange(txn.merchant, e.target.value)
                            }
                            style={{
                              ...inputStyle,
                              padding: "4px 8px",
                              fontSize: 12,
                              width: 160,
                              color: isNotePending ? "#22c55e" : "var(--text)",
                              fontWeight: isNotePending ? 600 : 400,
                            }}
                          />
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleDelete(txn.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--danger)",
                            color: "var(--danger)",
                            borderRadius: 4,
                            padding: "3px 10px",
                            fontSize: 12,
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 16,
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            <span>
              Showing {(data.page - 1) * data.page_size + 1}–
              {Math.min(data.page * data.page_size, data.total)} of{" "}
              {data.total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                style={paginationBtn}
              >
                Previous
              </button>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
                style={paginationBtn}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "8px 12px",
  fontSize: 13,
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontWeight: 500,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderBottom: "1px solid var(--border)",
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

const paginationBtn: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "6px 14px",
  fontSize: 13,
};
