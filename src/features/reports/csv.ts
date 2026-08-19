export function formatCsvRow(values: string[]): string {
  return values
    .map((v) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    })
    .join(",");
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [formatCsvRow(headers), ...rows.map(formatCsvRow)];
  return lines.join("\n");
}

export function downloadCsvUrl(csv: string): string {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  return URL.createObjectURL(blob);
}
