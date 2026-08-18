import type {
  InventorySupplier,
  Product,
  ProductBatch,
  ProductCategory,
  StockMovement,
} from "@/types/database.types";
import type { StockStatus } from "@/features/inventory/stock-engine";
import type { ProductUnit } from "@/features/inventory/units";

export type ProductArchiveFilter = "active" | "archived" | "all";
export type ProductStockFilter = "all" | "low" | "out";

export type ProductListItem = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unit: ProductUnit;
  costPriceCents: number;
  salePriceCents: number | null;
  currentStock: number;
  minimumStock: number;
  availableStock: number;
  active: boolean;
  trackStock: boolean;
  archivedAt: string | null;
  stockStatus: StockStatus;
  expirationAlert: "expired" | "expiring" | null;
};

export type ProductDetail = ProductListItem & {
  companyId: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  batches: ProductBatchView[];
  movements: StockMovementView[];
  suppliers: Array<{ id: string; name: string }>;
};

export type ProductBatchView = {
  id: string;
  batchCode: string | null;
  quantityRemaining: number;
  expirationDate: string | null;
  unitCostCents: number | null;
  expired: boolean;
  expiringSoon: boolean;
};

export type StockMovementView = {
  id: string;
  productId: string;
  productName: string;
  type: StockMovement["type"];
  quantity: number;
  signedQuantity: number;
  previousQuantity: number;
  newQuantity: number;
  unitCostCents: number | null;
  reason: string | null;
  notes: string | null;
  supplierId: string | null;
  supplierName: string | null;
  createdByName: string;
  createdAt: string;
};

export type ProductCategoryItem = Pick<
  ProductCategory,
  "id" | "name" | "archived_at" | "created_at" | "updated_at"
>;

export type InventorySupplierItem = Pick<
  InventorySupplier,
  | "id"
  | "name"
  | "contact_name"
  | "phone"
  | "email"
  | "document"
  | "notes"
  | "active"
  | "archived_at"
  | "created_at"
  | "updated_at"
>;

export type InventoryDashboardAlert = {
  lowStockCount: number;
  outOfStockCount: number;
};

export type ProductRow = Product;
export type ProductBatchRow = ProductBatch;
