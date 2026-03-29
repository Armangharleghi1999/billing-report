import { useState } from "react";
import { createRule, testPattern, type RuleOut } from "../api/client";

interface Props {
  categories: string[];
  onSave: (rule: RuleOut) => void;
  onClose: () => void;
}

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export default function RuleAddForm({ categories, onSave, onClose }: Props) {
  const [pattern, setPattern] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Other");
  const [priority, setPriority] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ matches: string[]; count: number } | null>(null);
  const [testing, setTesting] = useState(false);

  const patternValid = pattern.trim().length > 0 && isValidRegex(pattern);

  const handleTest = async () => {
    if (!patternValid) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const result = await testPattern(pattern);
      setTestResult(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!patternValid || !category.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const rule = await createRule({
        pattern: pattern.trim(),
        category: category.trim(),
        priority: priority ? Number(priority) : undefined,
        enabled,
      });
      onSave(rule);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Add Rule</h3>
          <button onClick={onClose} style={iconBtn}>
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: "8px 12px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "var(--radius)",
              color: "#ef4444",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Pattern field */}
        <div style={fieldGroup}>
          <label style={labelStyle}>
            Pattern{" "}
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(regex)</span>
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={pattern}
              onChange={(e) => {
                setPattern(e.target.value);
                setTestResult(null);
              }}
              placeholder="e.g. TESCO|SAINSBURY"
              style={{
                ...inputStyle,
                flex: 1,
                fontFamily: "monospace",
                borderColor: pattern && !patternValid ? "#ef4444" : "var(--border)",
              }}
            />
            <button
              onClick={handleTest}
              disabled={testing || !patternValid}
              style={testBtn}
            >
              {testing ? "Testing\u2026" : "Test"}
            </button>
          </div>
          {pattern && !patternValid && (
            <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>
              Invalid regex pattern
            </div>
          )}
          {testResult && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 12px",
                background: "var(--bg)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                Matches {testResult.count} transaction{testResult.count !== 1 ? "s" : ""}
                {testResult.count > 10 ? " (showing 10)" : ""}
              </div>
              {testResult.matches.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>No matches found</div>
              ) : (
                testResult.matches.map((m, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 11,
                      fontFamily: "monospace",
                      padding: "2px 0",
                      color: "var(--text)",
                    }}
                  >
                    {m}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Category field */}
        <div style={fieldGroup}>
          <label style={labelStyle}>Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Priority + Enabled row */}
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={labelStyle}>Priority</label>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="Auto (max + 10)"
              style={inputStyle}
            />
          </div>
          <div style={{ ...fieldGroup, flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <button
              onClick={() => setEnabled(!enabled)}
              style={{
                ...inputStyle,
                background: enabled ? "rgba(34,197,94,0.1)" : "var(--bg)",
                borderColor: enabled ? "rgba(34,197,94,0.4)" : "var(--border)",
                color: enabled ? "#22c55e" : "var(--text-muted)",
                cursor: "pointer",
                fontWeight: 600,
                width: "100%",
                textAlign: "left",
              }}
            >
              {enabled ? "Enabled" : "Disabled"}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button
            onClick={handleSave}
            disabled={saving || !patternValid || !category.trim()}
            style={{
              flex: 1,
              padding: "10px",
              borderRadius: "var(--radius)",
              border: "none",
              background: "var(--primary)",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: saving || !patternValid ? "not-allowed" : "pointer",
              opacity: saving || !patternValid ? 0.6 : 1,
            }}
          >
            {saving ? "Saving\u2026" : "Add Rule"}
          </button>
          <button onClick={onClose} style={cancelBtn}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "24px",
  width: 480,
  maxWidth: "calc(100vw - 48px)",
  maxHeight: "90vh",
  overflowY: "auto",
};

const fieldGroup: React.CSSProperties = { marginBottom: 16 };

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text)",
  padding: "8px 12px",
  fontSize: 13,
  boxSizing: "border-box",
};

const testBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const iconBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: 16,
  padding: "4px",
};

const cancelBtn: React.CSSProperties = {
  padding: "10px 20px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 14,
  cursor: "pointer",
};
