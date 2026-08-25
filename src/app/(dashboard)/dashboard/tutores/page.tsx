import Link from "next/link";
import { Plus } from "lucide-react";

import { getCustomers } from "@/features/customers/queries";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
import { formatDateTimeDisplay } from "@/lib/pet-display";
import { parsePageParam } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import {
  ClearSearchLink,
  PaginationNav,
  SearchForm,
} from "@/components/shared/pagination-nav";
import { FormFeedback } from "@/components/shared/form-feedback";
import { EmptyState } from "@/components/shared/empty-state";
import { ButtonLink } from "@/components/ui/button-link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CustomersPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    arquivado?: string;
  }>;
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const query = params.q?.trim() ?? "";

  const result = await getCustomers({
    companyId: context.membership.company.id,
    page,
    query,
  });

  return (
    <>
      <DashboardHeader title="Tutores" description="clientes e responsáveis pelos pets" />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Tutor arquivado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {result.total} {result.total === 1 ? "tutor cadastrado" : "tutores cadastrados"}
            </p>
          </div>
          <ButtonLink href="/dashboard/tutores/novo" data-tour-id="cta-new-customer">
            <Plus className="size-4" aria-hidden="true" />
            Novo tutor
          </ButtonLink>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Lista de tutores</CardTitle>
                <CardDescription>Busque por nome, telefone ou e-mail.</CardDescription>
              </div>
              <div className="w-full lg:max-w-md">
                <SearchForm
                  action="/dashboard/tutores"
                  defaultValue={query}
                  placeholder="Buscar tutores..."
                />
              </div>
            </div>
            <ClearSearchLink href="/dashboard/tutores" visible={Boolean(query)} />
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title={query ? "Nenhum tutor encontrado" : "Nenhum tutor cadastrado"}
                description={
                  query
                    ? "Tente outro termo de busca ou cadastre um novo tutor."
                    : "Comece cadastrando o primeiro tutor do seu pet shop."
                }
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Tutor</th>
                        <th className="px-4 py-3 font-medium">Telefone</th>
                        <th className="px-4 py-3 font-medium">E-mail</th>
                        <th className="px-4 py-3 font-medium">Pets</th>
                        <th className="px-4 py-3 font-medium">Cadastrado em</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((customer) => (
                        <tr key={customer.id} className="border-t">
                          <td className="px-4 py-3 font-medium">{customer.name}</td>
                          <td className="px-4 py-3">{formatPhoneDisplay(customer.phone)}</td>
                          <td className="px-4 py-3">{customer.email ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge variant="secondary">{customer.petsCount}</Badge>
                          </td>
                          <td className="px-4 py-3">{formatDateTimeDisplay(customer.created_at)}</td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/tutores/${customer.id}`}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              Ver detalhes
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-3 md:hidden">
                  {result.data.map((customer) => (
                    <Link
                      key={customer.id}
                      href={`/dashboard/tutores/${customer.id}`}
                      className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{customer.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {formatPhoneDisplay(customer.phone)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {customer.email ?? "Sem e-mail"}
                          </p>
                        </div>
                        <Badge variant="secondary">{customer.petsCount} pets</Badge>
                      </div>
                    </Link>
                  ))}
                </div>

                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/tutores"
                  searchParams={{ q: query || undefined }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
