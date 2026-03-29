import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { fetchMonthlySpend, type MonthlySpend } from "../../api/client";
import CategoryDrilldown from "./CategoryDrilldown";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e879f9", "#fb923c",
];

const SHORT_MONTHS = [
  "JAN","FEB","MAR","APR","MAY","JUN",
  "JUL","AUG","SEP","OCT","NOV","DEC",
];

function formatMonth(month: string): string {
  const [, m] = month.split("-");
  return SHORT_MONTHS[parseInt(m, 10) - 1] ?? month;
}

interface SliceData {
  name: string;
  value: number;
}

interface Props {
  startDate?: string;
  endDate?: string;
}

// Fixed height for the entire panel — drives both sides equally
const PANEL_HEIGHT = 460;
const PIE_SIZE = 280;

export default function CategoryPieChart({ startDate, endDate }: Props) {
  const [allData, setAllData] = useState<MonthlySpend[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    fetchMonthlySpend()
      .then(setAllData)
      .catch((e) => console.error("CategoryPieChart fetch error:", e));
  }, []);

  const availableMonths = useMemo(() => {
    const monthsWithData = new Set(
      allData.filter((d) => d.total > 0).map((d) => d.month)
    );
    return [...monthsWithData].sort().slice(-3);
  }, [allData]);

  useEffect(() => {
    if (availableMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(availableMonths[availableMonths.length - 1]);
    }
  }, [availableMonths, selectedMonth]);

  const { slices, total } = useMemo(() => {
    const filtered = allData
      .filter((d) => d.month === selectedMonth && d.total > 0)
      .map((d): SliceData => ({ name: d.category, value: Number(d.total) }))
      .sort((a, b) => b.value - a.value);
    const t = filtered.reduce((s, d) => s + d.value, 0);
    return { slices: filtered, total: t };
  }, [allData, selectedMonth]);

  const handleCategoryClick = (name: string) => {
    setSelectedCategory((prev) => (prev === name ? null : name));
  };

  if (allData.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>
        No spending data yet
      </p>
    );
  }

  return (
    <div style={{ display: "flex", gap: 0, height: PANEL_HEIGHT }}>

      {/* ── Left pane: pie + legend side-by-side + month buttons ── */}
      <div style={{ flex: "0 0 420px", display: "flex", flexDirection: "column", minWidth: 0 }}>
        {slices.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No data for {selectedMonth ? formatMonth(selectedMonth) : "this month"}
          </div>
        ) : (
          <>
            {/* Pie + vertical legend row */}
            <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
              {/* Pie */}
              <div style={{ flexShrink: 0 }}>
                <PieChart width={PIE_SIZE} height={PIE_SIZE}>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={125}
                    onClick={(entry: SliceData) => handleCategoryClick(entry.name)}
                    style={{ cursor: "pointer" }}
                  >
                    {slices.map((s, i) => (
                      <Cell
                        key={i}
                        fill={COLORS[i % COLORS.length]}
                        opacity={selectedCategory && selectedCategory !== s.name ? 0.3 : 1}
                        stroke={selectedCategory === s.name ? "#fff" : "none"}
                        strokeWidth={selectedCategory === s.name ? 2 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
                      return [
                        `£${value.toLocaleString(undefined, { minimumFractionDigits: 2 })} (${pct}%)`,
                        name,
                      ];
                    }}
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </div>

              {/* Vertical legend */}
              <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
                {slices.map((s, i) => {
                  const isSelected = selectedCategory === s.name;
                  return (
                    <div
                      key={s.name}
                      onClick={() => handleCategoryClick(s.name)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "5px 8px",
                        borderRadius: 4,
                        cursor: "pointer",
                        background: isSelected ? "rgba(99,102,241,0.12)" : "transparent",
                        border: isSelected ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent",
                        marginBottom: 3,
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: COLORS[i % COLORS.length],
                          flexShrink: 0,
                          opacity: selectedCategory && !isSelected ? 0.35 : 1,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          color: selectedCategory && !isSelected ? "var(--text-muted)" : "var(--text)",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {s.name}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                        £{s.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Month selector + total — pinned to bottom */}
        <div style={{ flexShrink: 0, paddingTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 8 }}>
            {availableMonths.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMonth(m)}
                style={{
                  padding: "5px 14px",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: m === selectedMonth ? "var(--primary)" : "transparent",
                  color: m === selectedMonth ? "#fff" : "var(--text-muted)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {formatMonth(m)}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>
            Total{" "}
            <strong style={{ color: "var(--text)" }}>
              £{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ width: 1, background: "var(--border)", margin: "0 20px", flexShrink: 0 }} />

      {/* ── Right pane: drill-down, fills remaining height ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {selectedCategory ? (
          <CategoryDrilldown
            category={selectedCategory}
            startDate={startDate}
            endDate={endDate}
          />
        ) : (
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              gap: 8,
            }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
            <span style={{ fontSize: 13 }}>Click a category to drill down</span>
          </div>
        )}
      </div>

    </div>
  );
}
