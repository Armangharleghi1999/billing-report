import { useState } from "react";
import {
  bulkDeleteRules,
  bulkToggleRules,
  deleteRule,
  fetchRuleStats,
  fetchRules,
  rescanRules,
  updateRule,
  type RuleOut,
} from "../api/client";
import { useFetch } from "../hooks/useFetch";
import { useCategories } from "../hooks/useCategories";
import CategoriesTab from "../components/CategoriesTab";
import RuleAddForm from "../components/RuleAddForm";
import RuleEditRow from "../components/RuleEditRow";
import RuleStats from "../components/RuleStats";

type ActiveTab = "rules" | "categories";

type SortBy = "priority" | "pattern" | "category" | "match_count" | "last_matched_at";
type SortOrder = "asc" | "desc";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(month / 12);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}

function categoryColor(category: string): string {
  const palette = [
    "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4",
    "#84cc16", "#f97316", "#ec4899", "#6366f1", "#ef4444",
  ];
  let hash = 0;
  for (const ch of category) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

const COL_LABELS: Record<SortBy, string> = {
  priority: "Priority",
  pattern: "Pattern",
  category: "Category",
  match_count: "Matches",
  last_matched_at: "Last matched",
};

export default function Rules() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("rules");
  const { data: categoriesData, refetch: refetchCategories } = useCategories();
  const categories = categoriesData ?? [];

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showUnusedOnly, setShowUnusedOnly] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("priority");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [rescanResult, setRescanResult] = useState<{
    updated: number;
    rules_matched: number;
    rules_unused: number;
  } | null>(null);
  const [rescanLoading, setRescanLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data, loading, refetch: refetchRules } = useFetch(
    () =>
      fetchRules({
        page,
        page_size: 50,
        category: categoryFilter || undefined,
        enabled: showDisabled ? undefined : true,
        search: search || undefined,
        unused_only: showUnusedOnly || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    [page, search, categoryFilter, showUnusedOnly, showDisabled, sortBy, sortOrder]
  );

  const { data: stats, refetch: refetchStats } = useFetch(
    () => fetchRuleStats(),
    []
  );

  const refetchAll = () => {
    refetchRules();
    refetchStats();
  };

  const handleSort = (col: SortBy) => {
    if (col === sortBy) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else { setSortBy(col); setSortOrder("desc"); }
    setPage(1);
  };

  const sortIndicator = (col: SortBy) =>
    col === sortBy ? (
      <span style={{ marginLeft: 4 }}>{sortOrder === "asc" ? "▲" : "▼"}</span>
    ) : null;

  const handleToggleEnabled = async (rule: RuleOut) => {
    await updateRule(rule.id, { enabled: !rule.enabled });
    refetchAll();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    await deleteRule(id);
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    refetchAll();
  };

  const handleEditSave = async (
    rule: RuleOut,
    updates: { pattern: string; category: string; priority: number }
  ) => {
    await updateRule(rule.id, updates);
    setEditingId(null);
    refetchAll();
  };

  const handleSelectAll = (checked: boolean) => {
    if (!data) return;
    setSelectedIds(checked ? new Set(data.items.map((r) => r.id)) : new Set());
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      checked ? n.add(id) : n.delete(id);
      return n;
    });
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (!confirm(`Delete ${ids.length} rule${ids.length > 1 ? "s" : ""}?`)) return;
    setBulkLoading(true);
    try {
      await bulkDeleteRules(ids);
      setSelectedIds(new Set());
      refetchAll();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkToggle = async (enabled: boolean) => {
    const ids = [...selectedIds];
    setBulkLoading(true);
    try {
      await bulkToggleRules(ids, enabled);
      setSelectedIds(new Set());
      refetchAll();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleRescan = async () => {
    setRescanLoading(true);
    setRescanResult(null);
    try {
      const result = await rescanRules();
      setRescanResult(result);
      refetchAll();
    } finally {
      setRescanLoading(false);
    }
  };

  const allSelected =
    data ? data.items.length > 0 && data.items.every((r) => selectedIds.has(r.id)) : false;
  const someSelected = selectedIds.size > 0;

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Rules &amp; Categories</h2>
        {activeTab === "rules" && (
          <button onClick={() => setShowAddForm(true)} style={primaryBtn}>
            + Add Rule
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
        {(["rules", "categories"] as ActiveTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 20px",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--primary)" : "2px solid transparent",
              color: activeTab === tab ? "var(--primary)" : "var(--text-muted)",
              fontWeight: activeTab === tab ? 600 : 400,
              fontSize: 14,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {tab === "rules" ? "Rules" : "Categories"}
          </button>
        ))}
      </div>

      {/* Categories tab */}
      {activeTab === "categories" && (
        <CategoriesTab categories={categories} onChanged={refetchCategories} />
      )}

      {/* Rules tab */}
      {activeTab === "rules" && (<>

      {/* Stats bar */}
      {stats && <RuleStats stats={stats} />}

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          placeholder="Search pattern or category\u2026"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inputStyle, minWidth: 220 }}
        />
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          style={inputStyle}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label style={toggleLabel}>
          <input
            type="checkbox"
            checked={showUnusedOnly}
            onChange={(e) => { setShowUnusedOnly(e.target.checked); setPage(1); }}
          />
          Unused only
        </label>
        <label style={toggleLabel}>
          <input
            type="checkbox"
            checked={showDisabled}
            onChange={(e) => { setShowDisabled(e.target.checked); setPage(1); }}
          />
          Show disabled
        </label>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div style={bulkBarStyle}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {selectedIds.size} selected
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => handleBulkToggle(true)}
              disabled={bulkLoading}
              style={outlineBtn}
            >
              Enable
            </button>
            <button
              onClick={() => handleBulkToggle(false)}
              disabled={bulkLoading}
              style={outlineBtn}
            >
              Disable
            </button>
            <button onClick={handleBulkDelete} disabled={bulkLoading} style={dangerOutlineBtn}>
              Delete selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading\u2026</p>
      ) : !data?.items.length ? (
        <p style={{ color: "var(--text-muted)" }}>No rules found.</p>
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
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                    />
                  </th>
                  {(
                    [
                      "priority",
                      "pattern",
                      "category",
                      "match_count",
                      "last_matched_at",
                    ] as SortBy[]
                  ).map((col) => (
                    <th
                      key={col}
                      style={{
                        ...thStyle,
                        cursor: "pointer",
                        userSelect: "none",
                        color: sortBy === col ? "var(--text)" : "var(--text-muted)",
                      }}
                      onClick={() => handleSort(col)}
                    >
                      {COL_LABELS[col]}
                      {sortIndicator(col)}
                    </th>
                  ))}
                  <th style={thStyle}>Enabled</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((rule) => {
                  if (editingId === rule.id) {
                    return (
                      <RuleEditRow
                        key={rule.id}
                        rule={rule}
                        categories={categories}
                        colCount={8}
                        onSave={(updates) => handleEditSave(rule, updates)}
                        onCancel={() => setEditingId(null)}
                      />
                    );
                  }

                  const catColor = categoryColor(rule.category);
                  return (
                    <tr
                      key={rule.id}
                      style={{ opacity: rule.enabled ? 1 : 0.5, transition: "background 0.1s" }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rule.id)}
                          onChange={(e) => handleSelectOne(rule.id, e.target.checked)}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={priorityBadge}>{rule.priority}</span>
                      </td>
                      <td style={tdStyle}>
                        <code style={{ fontFamily: "monospace", fontSize: 12 }}>
                          {rule.pattern}
                        </code>
                      </td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            background: catColor + "22",
                            color: catColor,
                            border: `1px solid ${catColor}44`,
                          }}
                        >
                          {rule.category}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{rule.match_count}</td>
                      <td
                        style={{
                          ...tdStyle,
                          color: rule.last_matched_at ? "var(--text)" : "var(--text-muted)",
                        }}
                      >
                        {relativeTime(rule.last_matched_at)}
                      </td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => handleToggleEnabled(rule)}
                          style={{
                            padding: "3px 10px",
                            borderRadius: 12,
                            border: "none",
                            background: rule.enabled
                              ? "rgba(34,197,94,0.15)"
                              : "rgba(255,255,255,0.07)",
                            color: rule.enabled ? "#22c55e" : "var(--text-muted)",
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {rule.enabled ? "ON" : "OFF"}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            onClick={() => setEditingId(rule.id)}
                            style={editBtn}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(rule.id)}
                            style={deleteBtn}
                          >
                            Delete
                          </button>
                        </div>
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
              Showing {(data.page - 1) * data.page_size + 1}&ndash;
              {Math.min(data.page * data.page_size, data.total)} of {data.total}
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

      {/* Cleanup tools */}
      <div
        style={{
          marginTop: 32,
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setCleanupOpen(!cleanupOpen)}
          style={{
            width: "100%",
            textAlign: "left",
            padding: "12px 16px",
            background: "var(--bg-card)",
            border: "none",
            color: "var(--text)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          Cleanup Tools
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            {cleanupOpen ? "▲" : "▼"}
          </span>
        </button>

        {cleanupOpen && (
          <div
            style={{
              padding: "16px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  setShowUnusedOnly(true);
                  setCleanupOpen(false);
                  setPage(1);
                }}
                style={outlineBtn}
              >
                Find unused rules
              </button>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Filter to rules with match count of zero
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={handleRescan}
                  disabled={rescanLoading}
                  style={outlineBtn}
                >
                  {rescanLoading ? "Rescanning\u2026" : "Re-scan all transactions"}
                </button>
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  Reset match counts and re-categorise all rule-tagged transactions
                </span>
              </div>
              {rescanResult && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.3)",
                    borderRadius: "var(--radius)",
                    fontSize: 13,
                  }}
                >
                  Done: {rescanResult.updated} transactions updated,{" "}
                  {rescanResult.rules_matched} rules matched,{" "}
                  {rescanResult.rules_unused} rules unused
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add form modal */}
      {showAddForm && (
        <RuleAddForm
          categories={categories}
          onSave={() => {
            setShowAddForm(false);
            refetchAll();
          }}
          onClose={() => setShowAddForm(false)}
        />
      )}
      </>)}
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

const toggleLabel: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const outlineBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
};

const dangerOutlineBtn: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--danger)",
  background: "transparent",
  color: "var(--danger)",
  fontSize: 13,
  cursor: "pointer",
};

const editBtn: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};

const deleteBtn: React.CSSProperties = {
  padding: "3px 10px",
  borderRadius: 4,
  border: "1px solid var(--danger)",
  background: "transparent",
  color: "var(--danger)",
  fontSize: 12,
  cursor: "pointer",
};

const bulkBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12,
  padding: "10px 14px",
  background: "rgba(99,102,241,0.08)",
  border: "1px solid rgba(99,102,241,0.3)",
  borderRadius: "var(--radius)",
};

const priorityBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 700,
  background: "rgba(255,255,255,0.08)",
  color: "var(--text)",
  fontFamily: "monospace",
};

const paginationBtn: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "6px 14px",
  fontSize: 13,
};
