import { useState } from "react";
import type { RuleOut } from "../api/client";

interface Props {
  rule: RuleOut;
  categories: string[];
  colCount?: number;
  onSave: (updates: { pattern: string; category: string; priority: number }) => Promise<void>;
  onCancel: () => void;
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export default function RuleEditRow({ rule, categories, onSave, onCancel }: Props) {
  const [pattern, setPattern] = useState(rule.pattern);
  const [category, setCategory] = useState(rule.category);
  const [priority, setPriority] = useState(String(rule.priority));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = pattern.trim().length > 0 && isValidRegex(pattern);

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ pattern: pattern.trim(), category, priority: Number(priority) });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr style={{ background: "rgba(99,102,241,0.06)" }}>
      {/* checkbox */}
      <td style={tdStyle} />
      {/* priority */}
      <td style={tdStyle}>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={{ ...inputStyle, width: 70 }}
        />
      </td>
      {/* pattern */}
      <td style={tdStyle}>
        <input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="Regex pattern"
          style={{
            ...inputStyle,
            fontFamily: "monospace",
            width: 280,
            borderColor: pattern && !valid ? "#ef4444" : "var(--border)",
          }}
        />
        {pattern && !valid && (
          <div style={{ fontSize: 11, color: "#ef4444", marginTop: 3 }}>Invalid regex</div>
        )}
      </td>
      {/* category */}
      <td style={tdStyle}>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={{ ...inputStyle, width: 160 }}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      {/* matches — read-only */}
      <td style={{ ...tdStyle, textAlign: "right" as const }}>{rule.match_count}</td>
      {/* last matched — read-only */}
      <td style={tdStyle} />
      {/* enabled — read-only */}
      <td style={tdStyle} />
      {/* actions */}
      <td style={{ ...tdStyle, whiteSpace: "nowrap" as const }}>
        {error && (
          <div style={{ color: "#ef4444", fontSize: 11, marginBottom: 4 }}>{error}</div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={handleSave} disabled={saving || !valid} style={saveBtn}>
            {saving ? "Saving\u2026" : "Save"}
          </button>
          <button onClick={onCancel} style={cancelBtn}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "5px 8px",
  fontSize: 12,
};

const tdStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderBottom: "1px solid var(--border)",
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
