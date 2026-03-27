import { useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal, SankeyGraph } from "d3-sankey";
import { SpendingFlow as SpendingFlowData } from "../../api/client";

interface Props {
  data: SpendingFlowData;
}

interface SNode {
  name: string;
  layer: number;
  color: string;
  // d3-sankey fills these in:
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  index?: number;
}

interface SLink {
  source: number;
  target: number;
  value: number;
}

const CATEGORY_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#ef4444", "#f97316", "#14b8a6", "#a855f7",
  "#84cc16", "#06b6d4", "#e11d48", "#7c3aed", "#059669",
];

export default function SpendingFlow({ data }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const income = Number(data.income);
  const unspent = Number(data.unspent);

  const { nodes, links, graph } = useMemo(() => {
    const rawNodes: SNode[] = [];
    const rawLinks: SLink[] = [];

    // Node 0: Income
    rawNodes.push({ name: "Income", layer: 0, color: "#22c55e" });

    // Category nodes + links from income
    const catColorMap: Record<string, string> = {};
    data.categories.forEach((cat, i) => {
      const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
      catColorMap[cat.name] = color;
      const catIdx = rawNodes.length;
      rawNodes.push({ name: cat.name, layer: 1, color });
      rawLinks.push({ source: 0, target: catIdx, value: Number(cat.total) });
    });

    // Unspent node → link from income
    if (unspent > 0) {
      const unspentIdx = rawNodes.length;
      rawNodes.push({ name: "Unspent / Savings", layer: 2, color: "#22c55e" });
      rawLinks.push({ source: 0, target: unspentIdx, value: unspent });
    }

    // Merchant nodes + links from categories
    data.categories.forEach((cat, i) => {
      const catIdx = 1 + i;
      cat.merchants.forEach((m) => {
        const mIdx = rawNodes.length;
        rawNodes.push({ name: m.name, layer: 2, color: catColorMap[cat.name] });
        rawLinks.push({ source: catIdx, target: mIdx, value: Number(m.total) });
      });
      // "Other" node if category total > sum of merchant totals
      const merchantSum = cat.merchants.reduce((s, m) => s + Number(m.total), 0);
      const other = Number(cat.total) - merchantSum;
      if (other > 0.01) {
        const oIdx = rawNodes.length;
        rawNodes.push({ name: `${cat.name} (other)`, layer: 2, color: catColorMap[cat.name] });
        rawLinks.push({ source: catIdx, target: oIdx, value: other });
      }
    });

    const width = 680;
    const height = Math.max(300, rawNodes.length * 18);

    const gen = sankey<SNode, SLink>()
      .nodeId((d) => d.index!)
      .nodeWidth(18)
      .nodePadding(10)
      .extent([[0, 0], [width, height]]);

    const graph = gen({
      nodes: rawNodes.map((n, i) => ({ ...n, index: i })),
      links: rawLinks.map((l) => ({ ...l })),
    } as SankeyGraph<SNode, SLink>);

    return { nodes: graph.nodes, links: graph.links, graph };
  }, [data]);

  const svgWidth = 680;
  const svgHeight = Math.max(300, nodes.length * 18);

  if (income === 0 && data.categories.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "40px 0" }}>
        No spending flow data yet
      </p>
    );
  }

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg width={svgWidth} height={svgHeight} style={{ display: "block", margin: "0 auto" }}>
        {/* Links */}
        {links.map((link: any, i) => {
          const path = sankeyLinkHorizontal()(link) ?? "";
          const width = Math.max(1, link.width);
          const sourceNode = nodes[link.source.index ?? link.source] as any;
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={sourceNode?.color ?? "#888"}
              strokeWidth={width}
              strokeOpacity={0.35}
              onMouseEnter={(e) => {
                const src = (link.source as any).name ?? "";
                const tgt = (link.target as any).name ?? "";
                setTooltip({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  text: `${src} → ${tgt}: £${Number(link.value).toFixed(2)}`,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "default" }}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node: any, i) => (
          <g key={i}>
            <rect
              x={node.x0}
              y={node.y0}
              width={node.x1 - node.x0}
              height={Math.max(1, node.y1 - node.y0)}
              fill={node.color}
              rx={3}
              onMouseEnter={(e) => {
                setTooltip({
                  x: e.nativeEvent.offsetX,
                  y: e.nativeEvent.offsetY,
                  text: `${node.name}: £${Number(node.value ?? 0).toFixed(2)}`,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: "default" }}
            />
            <text
              x={node.x0 < svgWidth / 2 ? node.x1 + 6 : node.x0 - 6}
              y={(node.y0 + node.y1) / 2}
              textAnchor={node.x0 < svgWidth / 2 ? "start" : "end"}
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--text)"
            >
              {node.name}
            </text>
          </g>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x + 12,
            top: tooltip.y - 8,
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            zIndex: 10,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
