import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IncomeVsExpenses } from "../../api/client";

interface Props {
  data: IncomeVsExpenses[];
}

export default function IncomeVsExpensesChart({ data }: Props) {
  if (!data.length) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
        No income/expense data yet.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    month: d.month,
    Income: Number(d.income),
    "Money From Friends": Number(d.money_from_friends),
    Expenses: Number(d.expenses),
    Savings: Number(d.savings),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={12} />
        <YAxis stroke="var(--text-muted)" fontSize={12} />
        <Tooltip
          contentStyle={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line
          type="monotone"
          dataKey="Income"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="Money From Friends"
          stroke="#06b6d4"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="Expenses"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="Savings"
          stroke="#6366f1"
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
