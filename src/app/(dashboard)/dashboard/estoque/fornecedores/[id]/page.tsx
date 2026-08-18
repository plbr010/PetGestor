import { ArchiveSupplierButton } from "@/features/inventory/components/archive-supplier-button";
import { InventorySubnav } from "@/features/inventory/components/inventory-subnav";
import { requireInventorySupplierById } from "@/features/inventory/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { FormFeedback } from "@/components/shared/form-feedback";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SupplierDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ atualizado?: string }>;
};

export default async function SupplierDetailPage({
  params,
  searchParams,
}: SupplierDetailPageProps) {
  const context = await requireCompanyContext();
  const { id } = await params;
  const query = await searchParams;
  const supplier = await requireInventorySupplierById(context.membership.company.id, id);

  return (
    <>
      <DashboardHeader title={supplier.name} description="fornecedor" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <InventorySubnav current="fornecedores" />
        {query.atualizado === "1" ? (
          <FormFeedback message="Fornecedor atualizado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!supplier.archived_at ? (
            <ButtonLink href={`/dashboard/estoque/fornecedores/${id}/editar`} variant="outline">
              Editar
            </ButtonLink>
          ) : (
            <span />
          )}
          {!supplier.archived_at ? <ArchiveSupplierButton supplierId={id} /> : null}
        </div>

        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={supplier.active ? "default" : "secondary"}>
                {supplier.active ? "Ativo" : "Inativo"}
              </Badge>
            </div>
            <Row label="Contato" value={supplier.contact_name ?? "—"} />
            <Row
              label="Telefone"
              value={supplier.phone ? formatPhoneDisplay(supplier.phone) : "—"}
            />
            <Row label="E-mail" value={supplier.email ?? "—"} />
            <Row label="Documento" value={supplier.document ?? "—"} />
            {supplier.notes ? <p className="pt-2 text-muted-foreground">{supplier.notes}</p> : null}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
