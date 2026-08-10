import Link from "next/link";
import { Plus } from "lucide-react";

import { EmployeeFilters } from "@/features/employees/components/employee-filters";
import { getEmployees } from "@/features/employees/queries";
import {
  formatServicesSummary,
  parseSchedulableFilter,
  parseStatusFilter,
  schedulableLabel,
} from "@/features/employees/utils";
import { requireCompanyContext } from "@/lib/auth/require-company-context";
import { formatPhoneDisplay } from "@/lib/phone";
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

type EmployeesPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    schedulable?: string;
    arquivado?: string;
  }>;
};

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const context = await requireCompanyContext();
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const query = params.q?.trim() ?? "";
  const status = parseStatusFilter(params.status);
  const schedulable = parseSchedulableFilter(params.schedulable);

  const result = await getEmployees({
    companyId: context.membership.company.id,
    page,
    query,
    status,
    schedulable,
  });

  return (
    <>
      <DashboardHeader
        title="Funcionários"
        description="Gerencie sua equipe e os serviços realizados por cada profissional."
      />
      <main className="flex-1 space-y-6 overflow-x-hidden p-4 sm:p-6">
        {params.arquivado === "1" ? (
          <FormFeedback message="Funcionário arquivado com sucesso." variant="success" />
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {result.total}{" "}
              {result.total === 1 ? "funcionário cadastrado" : "funcionários cadastrados"}
            </p>
          </div>
          <ButtonLink href="/dashboard/funcionarios/novo">
            <Plus className="size-4" aria-hidden="true" />
            Novo funcionário
          </ButtonLink>
        </div>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Lista de funcionários</CardTitle>
                <CardDescription>Busque por nome, cargo, telefone ou e-mail.</CardDescription>
              </div>
              <div className="w-full lg:max-w-md">
                <SearchForm
                  action="/dashboard/funcionarios"
                  defaultValue={query}
                  placeholder="Buscar funcionários..."
                  hiddenFields={{
                    status: status === "all" ? undefined : status,
                    schedulable: schedulable === "all" ? undefined : schedulable,
                  }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <EmployeeFilters status={status} schedulable={schedulable} query={query || undefined} />
              <ClearSearchLink
                href={`/dashboard/funcionarios${
                  status === "all" && schedulable === "all"
                    ? ""
                    : `?${[
                        status !== "all" ? `status=${status}` : "",
                        schedulable !== "all" ? `schedulable=${schedulable}` : "",
                      ]
                        .filter(Boolean)
                        .join("&")}`
                }`}
                visible={Boolean(query)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.data.length === 0 ? (
              <EmptyState
                title={query ? "Nenhum funcionário encontrado" : "Nenhum funcionário cadastrado"}
                description={
                  query
                    ? "Tente outro termo de busca ou cadastre um novo funcionário."
                    : "Comece cadastrando o primeiro membro da sua equipe."
                }
              />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium">Funcionário</th>
                        <th className="px-4 py-3 font-medium">Cargo</th>
                        <th className="px-4 py-3 font-medium">Serviços</th>
                        <th className="px-4 py-3 font-medium">Agenda</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.data.map((employee) => (
                        <tr key={employee.id} className="border-t">
                          <td className="px-4 py-3">
                            <div className="font-medium">{employee.name}</div>
                            {employee.phone ? (
                              <div className="text-muted-foreground">
                                {formatPhoneDisplay(employee.phone)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{employee.job_title ?? "—"}</td>
                          <td className="px-4 py-3">{formatServicesSummary(employee.services)}</td>
                          <td className="px-4 py-3">
                            {schedulableLabel(employee.can_be_scheduled, employee.active)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={employee.active ? "default" : "secondary"}>
                              {employee.active ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/dashboard/funcionarios/${employee.id}`}
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
                  {result.data.map((employee) => (
                    <Link
                      key={employee.id}
                      href={`/dashboard/funcionarios/${employee.id}`}
                      className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{employee.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {employee.job_title ?? "Sem cargo"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatServicesSummary(employee.services)}
                          </p>
                        </div>
                        <Badge variant={employee.active ? "default" : "secondary"}>
                          {employee.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>

                <PaginationNav
                  page={result.page}
                  totalPages={result.totalPages}
                  basePath="/dashboard/funcionarios"
                  searchParams={{
                    q: query || undefined,
                    status: status === "all" ? undefined : status,
                    schedulable: schedulable === "all" ? undefined : schedulable,
                  }}
                />
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
