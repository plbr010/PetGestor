type BarChartItem = { label: string; value: number };

type ReportBarChartProps = {
  data: BarChartItem[];
  color?: string;
  height?: number;
};

export function ReportBarChart({
  data,
  color = "var(--chart-1)",
  height = 200,
}: ReportBarChartProps) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = Math.max(Math.floor(600 / data.length) - 8, 12);
  const chartWidth = data.length * (barWidth + 8);
  const paddingBottom = 30;
  const chartHeight = height - paddingBottom;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${height}`}
      className="w-full"
      role="img"
      aria-label="Gráfico de barras"
    >
      {data.map((item, i) => {
        const barHeight = (item.value / max) * chartHeight;
        const x = i * (barWidth + 8) + 4;
        const y = chartHeight - barHeight;
        return (
          <g key={item.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={3}
              fill={color}
              opacity={0.85}
            >
              <title>{`${item.label}: ${item.value}`}</title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {item.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
