import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MerchantBreakdown } from "../../api/client";

interface Props {
  data: MerchantBreakdown[];
}

export default function MerchantBreakdownChart({ data }: Props) {
  if (!data.length) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
        No merchant data yet.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    merchant: d.merchant.length > 20 ? d.merchant.slice(0, 18) + "..." : d.merchant,
    total: Number(d.total),
    count: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(300, data.length * 30)}>
      <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis type="number" stroke="var(--text-muted)" fontSize={12} />
        <YAxis
          type="category"
          dataKey="merchant"
          width={140}
          stroke="var(--text-muted)"
          fontSize={11}
        />
        <Tooltip
          contentStyle={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(value: number) => [`£${value.toFixed(2)}`, "Total"]}
        />
        <Bar dataKey="total" fill="#6366f1" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
