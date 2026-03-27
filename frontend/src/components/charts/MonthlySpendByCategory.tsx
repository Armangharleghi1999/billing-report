import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlySpend } from "../../api/client";

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

interface Props {
  data: MonthlySpend[];
}

export default function MonthlySpendByCategory({ data }: Props) {
  const { chartData, categories } = useMemo(() => {
    const months = new Map<string, Record<string, number>>();
    const catSet = new Set<string>();

    for (const item of data) {
      catSet.add(item.category);
      const existing = months.get(item.month) || { month: item.month };
      existing[item.category] = Number(item.total);
      months.set(item.month, existing);
    }

    return {
      chartData: Array.from(months.values()),
      categories: Array.from(catSet),
    };
  }, [data]);

  if (!chartData.length) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
        No spending data yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} />
        <YAxis stroke="var(--text-muted)" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
            zIndex: 1000,
          }}
          wrapperStyle={{ zIndex: 1000 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {categories.map((cat, i) => (
          <Bar
            key={cat}
            dataKey={cat}
            stackId="stack"
            fill={COLORS[i % COLORS.length]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
