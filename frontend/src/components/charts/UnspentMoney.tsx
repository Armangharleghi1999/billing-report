import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IncomeVsExpenses } from "../../api/client";

interface Props {
  data: IncomeVsExpenses[];
}

function formatMonth(m: string) {
  const [year, month] = m.split("-");
  return new Date(Number(year), Number(month) - 1).toLocaleString("default", {
    month: "short",
    year: "2-digit",
  });
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as IncomeVsExpenses;
  const savings = Number(d.savings);
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 14px",
        fontSize: 13,
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 6 }}>{formatMonth(label)}</p>
      <p style={{ color: "var(--success)" }}>Income: £{Number(d.income).toFixed(2)}</p>
      <p style={{ color: "var(--danger)" }}>Expenses: £{Number(d.expenses).toFixed(2)}</p>
      <p style={{ color: savings >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
        {savings >= 0 ? "Saved" : "Overspent"}: £{Math.abs(savings).toFixed(2)}
      </p>
    </div>
  );
}

export default function UnspentMoney({ data }: Props) {
  if (!data.length) {
    return (
      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
        No data yet
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `£${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
          tick={{ fontSize: 11, fill: "var(--text-muted)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
        <Bar dataKey="savings" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={Number(entry.savings) >= 0 ? "#22c55e" : "#ef4444"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
