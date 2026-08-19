type LineChartItem = { label: string; value: number };

type ReportLineChartProps = {
  data: LineChartItem[];
  color?: string;
  height?: number;
};

export function ReportLineChart({
  data,
  color = "var(--chart-1)",
  height = 200,
}: ReportLineChartProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const paddingBottom = 30;
  const paddingTop = 10;
  const chartHeight = height - paddingBottom - paddingTop;
  const chartWidth = Math.max(data.length * 50, 300);

  const points = data.map((item, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * (chartWidth - 20) + 10;
    const y = paddingTop + chartHeight - (item.value / max) * chartHeight;
    return { x, y, item };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${height}`}
      className="w-full"
      role="img"
      aria-label="Gráfico de linha"
    >
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {points.map((p) => (
        <g key={p.item.label}>
          <circle cx={p.x} cy={p.y} r={3} fill={color}>
            <title>{`${p.item.label}: ${p.item.value}`}</title>
          </circle>
          <text
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {p.item.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
