import { useState } from "react";
import {
  createCategory,
  deleteCategory,
  renameCategory,
} from "../api/client";

interface Props {
  categories: string[];
  onChanged: () => void;
}

export default function CategoriesTab({ categories, onChanged }: Props) {
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [showAddRow, setShowAddRow] = useState(false);

  const startEdit = (name: string) => {
    setEditingName(name);
    setEditValue(name);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingName(null);
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingName) return;
    const trimmed = editValue.trim();
    if (!trimmed) { setEditError("Name cannot be empty"); return; }
    if (trimmed === editingName) { cancelEdit(); return; }
    setEditSaving(true);
    setEditError(null);
    try {
      await renameCategory(editingName, trimmed);
      setEditingName(null);
      onChanged();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete "${name}"? All rules and transactions using it will be reassigned to "Other".`)) return;
    try {
      await deleteCategory(name);
      onChanged();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleAdd = async () => {
    const trimmed = addValue.trim();
    if (!trimmed) { setAddError("Name cannot be empty"); return; }
    setAddSaving(true);
    setAddError(null);
    try {
      await createCategory(trimmed);
      setAddValue("");
      setShowAddRow(false);
      onChanged();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : "Failed to add category");
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
          {categories.length} categories · renaming or deleting cascades to all rules and transactions
        </p>
        <button onClick={() => { setShowAddRow(true); setAddValue(""); setAddError(null); }} style={primaryBtn}>
          + Add Category
        </button>
      </div>

      <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={thStyle}>Category name</th>
              <th style={{ ...thStyle, width: 160, textAlign: "right" as const }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {showAddRow && (
              <tr style={{ background: "rgba(99,102,241,0.06)" }}>
                <td style={tdStyle}>
                  <input
                    autoFocus
                    value={addValue}
                    onChange={(e) => setAddValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAddRow(false); }}
                    placeholder="New category name"
                    style={inputStyle}
                  />
                  {addError && <div style={errorText}>{addError}</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" as const }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button onClick={handleAdd} disabled={addSaving} style={saveBtn}>
                      {addSaving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => setShowAddRow(false)} style={cancelBtn}>Cancel</button>
                  </div>
                </td>
              </tr>
            )}
            {categories.map((name) => (
              <tr
                key={name}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td style={tdStyle}>
                  {editingName === name ? (
                    <>
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") cancelEdit(); }}
                        style={inputStyle}
                      />
                      {editError && <div style={errorText}>{editError}</div>}
                    </>
                  ) : (
                    <span>{name}</span>
                  )}
                </td>
                <td style={{ ...tdStyle, textAlign: "right" as const }}>
                  {editingName === name ? (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={handleSaveEdit} disabled={editSaving} style={saveBtn}>
                        {editSaving ? "Saving…" : "Save"}
                      </button>
                      <button onClick={cancelEdit} style={cancelBtn}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => startEdit(name)} style={editBtn}>Edit</button>
                      <button onClick={() => handleDelete(name)} style={deleteBtn}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  borderBottom: "1px solid var(--border)",
  color: "var(--text-muted)",
  fontWeight: 500,
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderBottom: "1px solid var(--border)",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "6px 10px",
  fontSize: 13,
  width: 260,
};

const errorText: React.CSSProperties = {
  fontSize: 11,
  color: "#ef4444",
  marginTop: 3,
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const saveBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "var(--radius)",
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const cancelBtn: React.CSSProperties = {
  padding: "5px 12px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 12,
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
