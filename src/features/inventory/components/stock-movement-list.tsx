import { formatQuantity } from "@/features/inventory/stock-engine";
import type { StockMovementView } from "@/features/inventory/types";
import type { ProductUnit } from "@/features/inventory/units";
import { PRODUCT_UNIT_SHORT_LABELS } from "@/features/inventory/units";
import { formatMovementType, formatMovementWhen, formatSignedQuantity } from "@/features/inventory/utils";
import { formatCentsToBRL } from "@/lib/money";

export function StockMovementList({
  movements,
  timeZone,
  unit = "unit",
  showProductName = false,
}: {
  movements: StockMovementView[];
  timeZone: string;
  unit?: ProductUnit;
  showProductName?: boolean;
}) {
  if (movements.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>;
  }

  const shortUnit = PRODUCT_UNIT_SHORT_LABELS[unit];

  return (
    <ol className="space-y-3">
      {movements.map((movement) => (
        <li key={movement.id} className="rounded-xl border bg-card p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                {formatMovementWhen(movement.createdAt, timeZone)}
              </p>
              {showProductName ? (
                <p className="font-medium">{movement.productName}</p>
              ) : null}
              <p className="font-medium">
                {formatMovementType(movement.type, movement.reason)}
              </p>
            </div>
            <p
              className={`text-lg font-semibold ${
                movement.signedQuantity < 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {formatSignedQuantity(movement.signedQuantity, unit)}
            </p>
          </div>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            {movement.unitCostCents != null ? (
              <p>{formatCentsToBRL(movement.unitCostCents)}/{shortUnit}</p>
            ) : null}
            <p>
              Saldo: {formatQuantity(movement.previousQuantity, shortUnit)} →{" "}
              {formatQuantity(movement.newQuantity, shortUnit)}
            </p>
            <p>{movement.createdByName}</p>
            {movement.supplierName ? <p>Fornecedor: {movement.supplierName}</p> : null}
            {movement.notes ? <p>{movement.notes}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
