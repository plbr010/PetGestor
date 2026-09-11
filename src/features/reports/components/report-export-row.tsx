import { CsvExportButton } from "@/features/reports/components/csv-export-button";

type ReportExportRowProps = {
  csv: string;
  filename: string;
};

export function ReportExportRow({ csv, filename }: ReportExportRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <CsvExportButton csv={csv} filename={filename} />
    </div>
  );
}
