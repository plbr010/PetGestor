type RankingItem = {
  rank: number;
  label: string;
  value: string;
  subtitle?: string;
};

type ReportRankingTableProps = {
  items: RankingItem[];
  emptyMessage?: string;
};

export function ReportRankingTable({
  items,
  emptyMessage = "Nenhum dado disponível neste período.",
}: ReportRankingTableProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={`${item.rank}-${item.label}`}
          className="flex items-center gap-3 rounded-lg border px-3 py-2"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {item.rank}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.label}</p>
            {item.subtitle ? (
              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-sm font-semibold">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
