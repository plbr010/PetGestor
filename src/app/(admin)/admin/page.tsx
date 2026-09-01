import { AdminCompaniesTable } from "@/features/admin/components/admin-companies-table";
import { AdminFilters } from "@/features/admin/components/admin-filters";
import { AdminSummaryCards } from "@/features/admin/components/admin-summary-cards";
import { DemoAccountCleanupForm } from "@/features/admin/components/demo-account-cleanup-form";
import { WhatsAppAdminTestForm } from "@/features/admin/components/whatsapp-admin-test-form";
import { listDemoAccountCandidates } from "@/features/admin/demo-account-cleanup";
import type { AdminAccountStatusFilter } from "@/features/admin/types";
import { listAdminCompanies } from "@/features/admin/queries";

type AdminPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
  }>;
};

function parseStatus(value: string | undefined): AdminAccountStatusFilter {
  switch (value) {
    case "trial":
    case "active":
    case "past_due":
    case "cancelled":
    case "blocked":
      return value;
    default:
      return "all";
  }
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const status = parseStatus(params.status);

  const [{ items, summary }, demoCandidates] = await Promise.all([
    listAdminCompanies({ query, status }),
    listDemoAccountCandidates(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assinaturas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão consolidada de contas, trials e cobranças do PetGestor.
        </p>
      </div>

      <AdminSummaryCards summary={summary} />
      <DemoAccountCleanupForm candidates={demoCandidates} />
      <WhatsAppAdminTestForm />
      <AdminFilters query={query} status={status} />
      <AdminCompaniesTable items={items} />
    </div>
  );
}
