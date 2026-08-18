import { PosSubnav } from "@/features/pos/components/pos-subnav";
import { PosWorkspace } from "@/features/pos/components/pos-workspace";
import { getPosCatalog } from "@/features/pos/queries";
import { getProductCategories } from "@/features/inventory/queries";
import { getCustomerOptions } from "@/features/customers/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { getTodayInTimezone } from "@/lib/timezone";
import { DashboardHeader } from "@/components/layout/dashboard-header";

export default async function PosPage() {
  const context = await requireCompanyContext();
  const companyId = context.membership.company.id;
  const today = getTodayInTimezone(context.membership.company.timezone);

  const [products, categories, customers] = await Promise.all([
    getPosCatalog(companyId, today),
    getProductCategories(companyId),
    getCustomerOptions(companyId),
  ]);

  return (
    <>
      <DashboardHeader title="PDV" description="Venda rápida de produtos no balcão" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-6">
        <PosSubnav current="pdv" />
        <PosWorkspace
          products={products}
          categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          customers={customers}
        />
      </main>
    </>
  );
}
