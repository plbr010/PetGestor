"use client";

import { Download } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";

type CsvExportButtonProps = {
  csv: string;
  filename: string;
};

export function CsvExportButton({ csv, filename }: CsvExportButtonProps) {
  const handleClick = useCallback(() => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [csv, filename]);

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <Download className="size-4" aria-hidden="true" />
      Exportar CSV
    </Button>
  );
}
