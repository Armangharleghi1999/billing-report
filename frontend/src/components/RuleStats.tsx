import type { RuleStatsOut } from "../api/client";

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} month${month === 1 ? "" : "s"} ago`;
  const year = Math.floor(month / 12);
  return `${year} year${year === 1 ? "" : "s"} ago`;
}

interface Props {
  stats: RuleStatsOut;
}

export default function RuleStats({ stats }: Props) {
  return (
    <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
      <StatCard label="Active rules" value={String(stats.total_enabled)} />
      <StatCard label="Categories covered" value={String(stats.categories_covered)} />
      <StatCard
        label="Unused rules"
        value={String(stats.unused_count)}
        highlight={stats.unused_count > 0 ? "amber" : undefined}
      />
      <StatCard label="Last updated" value={relativeTime(stats.last_updated)} />
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "amber";
}) {
  return (
    <div
      style={{
        flex: "1 1 160px",
        background: "var(--bg-card)",
        border: `1px solid ${highlight === "amber" ? "rgba(245,158,11,0.4)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "14px 18px",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: highlight === "amber" ? "#f59e0b" : "var(--text)",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}
