import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchCategoryDrilldown, type CategoryDrilldownItem } from "../../api/client";

const COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  "#e879f9", "#fb923c", "#a78bfa", "#34d399", "#fbbf24",
  "#f87171", "#60a5fa", "#4ade80",
];

const SHORT_MONTHS = [
  "JAN","FEB","MAR","APR","MAY","JUN",
  "JUL","AUG","SEP","OCT","NOV","DEC",
];

function formatMonth(m: string): string {
  const [, mon] = m.split("-");
  return SHORT_MONTHS[parseInt(mon, 10) - 1] ?? m;
}

interface Props {
  category: string;
  startDate?: string;
  endDate?: string;
}

type View = "total" | "itemised";

export default function CategoryDrilldown({ category, startDate, endDate }: Props) {
  const [data, setData] = useState<CategoryDrilldownItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("total");
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    setHiddenLines(new Set());
    fetchCategoryDrilldown(category, startDate, endDate)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [category, startDate, endDate]);

  const months = useMemo(
    () => [...new Set(data.map((d) => d.month))].sort(),
    [data]
  );

  const descriptions = useMemo(() => {
    const totals = new Map<string, number>();
    // Coerce to Number — backend returns Decimal serialised as a string
    for (const d of data) {
      totals.set(d.description, (totals.get(d.description) ?? 0) + Number(d.total));
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([desc]) => desc);
  }, [data]);

  const totalChartData = useMemo(() =>
    months.map((month) => ({
      month,
      Total: data
        .filter((d) => d.month === month)
        .reduce((sum, d) => sum + Number(d.total), 0),  // coerce here too
    })),
    [data, months]
  );

  const itemisedChartData = useMemo(() => {
    const lookup = new Map<string, Map<string, number>>();
    for (const item of data) {
      if (!lookup.has(item.month)) lookup.set(item.month, new Map());
      lookup.get(item.month)!.set(item.description, Number(item.total)); // coerce
    }
    return months.map((month) => {
      const row: Record<string, unknown> = { month };
      for (const desc of descriptions) {
        row[desc] = lookup.get(month)?.get(desc) ?? 0;
      }
      return row;
    });
  }, [data, months, descriptions]);

  const toggleLine = (desc: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      next.has(desc) ? next.delete(desc) : next.add(desc);
      return next;
    });
  };

  const visibleDescriptions = descriptions.filter((d) => !hiddenLines.has(d));

  const fmt = (v: number) =>
    `£${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div style={centreStyle}>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div style={centreStyle}>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
          No data for <strong>{category}</strong> in the selected date range.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{category}</span>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
          {(["total", "itemised"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 14px",
                background: view === v ? "var(--primary)" : "transparent",
                color: view === v ? "#fff" : "var(--text-muted)",
                border: "none",
                fontSize: 12,
                fontWeight: view === v ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Chart — fills available height */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={view === "total" ? totalChartData : itemisedChartData}
            margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="month"
              tickFormatter={formatMonth}
              stroke="var(--text-muted)"
              fontSize={11}
            />
            <YAxis
              stroke="var(--text-muted)"
              fontSize={11}
              tickFormatter={(v) => `£${v}`}
              width={64}
            />
            <Tooltip
              contentStyle={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                fontSize: 12,
              }}
              formatter={(value: number, name: string) => [fmt(value), name]}
              labelFormatter={(label) => formatMonth(label as string)}
            />
            {view === "total" ? (
              <Line
                type="monotone"
                dataKey="Total"
                stroke={COLORS[0]}
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ) : (
              visibleDescriptions.map((desc, i) => (
                <Line
                  key={desc}
                  type="monotone"
                  dataKey={desc}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={1.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Itemised merchant checkboxes */}
      {view === "itemised" && descriptions.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            marginTop: 10,
            borderTop: "1px solid var(--border)",
            paddingTop: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button
              onClick={() => setHiddenLines(new Set())}
              style={{
                padding: "2px 10px",
                fontSize: 11,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Tick All
            </button>
            <button
              onClick={() => setHiddenLines(new Set(descriptions))}
              style={{
                padding: "2px 10px",
                fontSize: 11,
                borderRadius: "var(--radius)",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              Untick All
            </button>
          </div>
          <div
            style={{
              maxHeight: 120,
              overflowY: "auto",
              display: "flex",
              flexWrap: "wrap",
              gap: "5px 14px",
            }}
          >
          {descriptions.map((desc, i) => {
            const hidden = hiddenLines.has(desc);
            return (
              <label
                key={desc}
                title={desc}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                  fontSize: 11,
                  color: hidden ? "var(--text-muted)" : "var(--text)",
                  maxWidth: 220,
                }}
              >
                <input
                  type="checkbox"
                  checked={!hidden}
                  onChange={() => toggleLine(desc)}
                  style={{ accentColor: COLORS[i % COLORS.length], cursor: "pointer" }}
                />
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: COLORS[i % COLORS.length],
                    flexShrink: 0,
                    opacity: hidden ? 0.3 : 1,
                  }}
                />
                <span style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textDecoration: hidden ? "line-through" : "none",
                }}>
                  {desc}
                </span>
              </label>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

const centreStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  minHeight: 300,
};
