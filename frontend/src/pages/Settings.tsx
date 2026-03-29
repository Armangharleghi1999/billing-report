import { useState } from "react";
import {
  GRAPH_ITEMS,
  type GraphId,
  getGraphVisibility,
  setGraphVisible,
} from "../hooks/useGraphSettings";

export default function Settings() {
  const [visibility, setVisibility] = useState(getGraphVisibility);

  function toggle(id: GraphId) {
    const next = !visibility[id];
    setGraphVisible(id, next);
    setVisibility((prev) => ({ ...prev, [id]: next }));
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 28 }}>Settings</h2>

      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px 24px",
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Dashboard Graphs</h3>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
          Choose which graphs are visible on the Dashboard.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {GRAPH_ITEMS.map((item) => (
            <label
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={visibility[item.id]}
                onChange={() => toggle(item.id)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
              />
              {item.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
