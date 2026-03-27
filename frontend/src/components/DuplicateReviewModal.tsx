import { useState } from "react";
import type { DuplicateItem } from "../api/client";

interface Props {
  duplicates: DuplicateItem[];
  onResolve: (resolutions: { dedup_hash: string; action: string }[]) => void;
  onClose: () => void;
}

export default function DuplicateReviewModal({
  duplicates,
  onResolve,
  onClose,
}: Props) {
  const [decisions, setDecisions] = useState<Record<string, string>>({});

  const setDecision = (hash: string, action: string) => {
    setDecisions((prev) => ({ ...prev, [hash]: action }));
  };

  const allDecided = duplicates.every(
    (d) => d.incoming.dedup_hash && decisions[d.incoming.dedup_hash]
  );

  const handleSubmit = () => {
    const resolutions = duplicates
      .filter((d) => d.incoming.dedup_hash)
      .map((d) => ({
        dedup_hash: d.incoming.dedup_hash!,
        action: decisions[d.incoming.dedup_hash!] || "skip",
      }));
    onResolve(resolutions);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: 12,
          border: "1px solid var(--border)",
          padding: 28,
          maxWidth: 800,
          maxHeight: "80vh",
          overflowY: "auto",
          width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
          Duplicate Transactions Found
        </h3>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          The following transactions already exist in the database. Choose to
          skip or replace each one.
        </p>

        {duplicates.map((dup, idx) => {
          const hash = dup.incoming.dedup_hash || `idx-${idx}`;
          return (
            <div
              key={hash}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Existing
                  </div>
                  <p style={{ fontSize: 13 }}>
                    {dup.existing.date} — {dup.existing.description}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>
                    £{Number(dup.existing.amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      marginBottom: 6,
                    }}
                  >
                    Incoming
                  </div>
                  <p style={{ fontSize: 13 }}>
                    {dup.incoming.date} — {dup.incoming.description}
                  </p>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>
                    £{Number(dup.incoming.amount).toFixed(2)}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setDecision(hash, "skip")}
                  style={{
                    ...btnStyle,
                    background:
                      decisions[hash] === "skip"
                        ? "var(--primary)"
                        : "var(--bg)",
                    color:
                      decisions[hash] === "skip" ? "#fff" : "var(--text-muted)",
                  }}
                >
                  Skip
                </button>
                <button
                  onClick={() => setDecision(hash, "replace")}
                  style={{
                    ...btnStyle,
                    background:
                      decisions[hash] === "replace"
                        ? "var(--warning)"
                        : "var(--bg)",
                    color:
                      decisions[hash] === "replace"
                        ? "#000"
                        : "var(--text-muted)",
                  }}
                >
                  Replace
                </button>
              </div>
            </div>
          );
        })}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
            marginTop: 16,
          }}
        >
          <button onClick={onClose} style={{ ...btnStyle, padding: "8px 20px" }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allDecided}
            style={{
              ...btnStyle,
              padding: "8px 20px",
              background: allDecided ? "var(--primary)" : "var(--bg)",
              color: allDecided ? "#fff" : "var(--text-muted)",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  padding: "6px 14px",
  fontSize: 13,
  background: "var(--bg)",
  color: "var(--text-muted)",
};
