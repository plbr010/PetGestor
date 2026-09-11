const CSV_BOM = "\uFEFF";
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCsvCell(value: string): string {
  let cell = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (FORMULA_PREFIX.test(cell) || cell.startsWith("\t")) {
    cell = `'${cell}`;
  }

  if (
    cell.includes(",") ||
    cell.includes(";") ||
    cell.includes('"') ||
    cell.includes("\n") ||
    cell.startsWith("'")
  ) {
    return `"${cell.replace(/"/g, '""')}"`;
  }

  return cell;
}

export function formatCsvRow(values: string[]): string {
  return values.map(sanitizeCsvCell).join(",");
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [formatCsvRow(headers), ...rows.map(formatCsvRow)];
  return `${CSV_BOM}${lines.join("\n")}`;
}

export function downloadCsvUrl(csv: string): string {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  return URL.createObjectURL(blob);
}
