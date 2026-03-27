import { useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchMonthlySpend, type MonthlySpend } from "../../api/client";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#e879f9",
  "#fb923c",
];

const SHORT_MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function formatMonth(month: string): string {
  const [, m] = month.split("-");
  return SHORT_MONTHS[parseInt(m, 10) - 1] ?? month;
}

interface SliceData {
  name: string;
  value: number;
}

export default function CategoryPieChart() {
  const [allData, setAllData] = useState<MonthlySpend[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("");

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

  if (allData.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: 32 }}>
        No spending data yet
      </p>
    );
  }

  return (
    <div>
      {slices.length === 0 ? (
        <div
          style={{
            height: 280,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No expense data for {selectedMonth ? formatMonth(selectedMonth) : "this month"}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            {/* Pie chart */}
            <div style={{ flex: "0 0 280px" }}>
              <PieChart width={280} height={280}>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                >
                  {slices.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
                />
              </PieChart>
            </div>

            {/* Category legend table */}
            <div style={{ flex: 1, overflowY: "auto", maxHeight: 280 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th style={{ textAlign: "left", paddingBottom: 8, fontWeight: 500 }}>Category</th>
                    <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 500 }}>Amount</th>
                    <th style={{ textAlign: "right", paddingBottom: 8, fontWeight: 500 }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {slices.map((s, i) => (
                    <tr key={s.name}>
                      <td style={{ padding: "4px 0", display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: COLORS[i % COLORS.length],
                            flexShrink: 0,
                            display: "inline-block",
                          }}
                        />
                        {s.name}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 0 4px 12px" }}>
                        £{s.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ textAlign: "right", padding: "4px 0 4px 12px", color: "var(--text-muted)" }}>
                        {total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0"}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total row */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 8,
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 24,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span style={{ color: "var(--text-muted)" }}>Total</span>
            <span>£{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </>
      )}

      {/* Month selector buttons */}
      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16 }}>
        {availableMonths.map((m) => (
          <button
            key={m}
            onClick={() => setSelectedMonth(m)}
            style={{
              padding: "6px 16px",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              background: m === selectedMonth ? "var(--primary)" : "transparent",
              color: m === selectedMonth ? "#fff" : "var(--text-muted)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {formatMonth(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
