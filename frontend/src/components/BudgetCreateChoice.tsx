interface BudgetCreateChoiceProps {
  onChooseBlank: () => void;
  onChooseTemplate: () => void;
  onCancel: () => void;
}

export default function BudgetCreateChoice({
  onChooseBlank,
  onChooseTemplate,
  onCancel,
}: BudgetCreateChoiceProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 400,
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "40px 48px",
          maxWidth: 560,
          width: "100%",
        }}
      >
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, textAlign: "center" }}>
          Create Budget
        </h2>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-muted)",
            textAlign: "center",
            marginBottom: 32,
          }}
        >
          How would you like to start?
        </p>

        <div style={{ display: "flex", gap: 16 }}>
          <button
            onClick={onChooseBlank}
            style={{
              flex: 1,
              padding: "20px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Blank Budget</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Start from scratch.</div>
          </button>

          <button
            onClick={onChooseTemplate}
            style={{
              flex: 1,
              padding: "20px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--primary)",
              background: "transparent",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: "var(--primary)" }}>
              Auto-generate from History
            </div>
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Pre-fill with recurring spending from your last 3 months.
            </div>
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            &lt; Back
          </button>
        </div>
      </div>
    </div>
  );
}
