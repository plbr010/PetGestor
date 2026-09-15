import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: fromMock,
  })),
}));

vi.mock("@/features/pets/enrich-photo-thumbs", () => ({
  buildPetPhotoThumbMap: vi.fn(async () => new Map()),
}));

type QueryResult = {
  data: unknown[] | null;
  count: number | null;
  error: { code?: string; message?: string } | null;
};

function createBuilder(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  builder.select = vi.fn(self);
  builder.eq = vi.fn(self);
  builder.is = vi.fn(self);
  builder.or = vi.fn(self);
  builder.order = vi.fn(self);
  builder.in = vi.fn(self);
  builder.range = vi.fn(async () => result);
  builder.then = (
    onFulfilled: (value: QueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return builder;
}

const COMPANY_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("listagens do dashboard — paginação fora do intervalo", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("tutores: PGRST103 na page=2 devolve total real e não lança", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table !== "customers") {
        throw new Error(`tabela inesperada: ${table}`);
      }
      if (fromMock.mock.calls.filter((call) => call[0] === "customers").length <= 1) {
        return createBuilder({
          data: null,
          count: null,
          error: { code: "PGRST103", message: "Requested range not satisfiable" },
        });
      }
      return createBuilder({ data: [], count: 5, error: null });
    });

    const { getCustomers } = await import("@/features/customers/queries");
    const result = await getCustomers({ companyId: COMPANY_ID, page: 2 });

    expect(result.total).toBe(5);
    expect(result.data).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  it("pets: PGRST103 não zera o total existente", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table !== "pets") {
        throw new Error(`tabela inesperada: ${table}`);
      }
      if (fromMock.mock.calls.filter((call) => call[0] === "pets").length <= 1) {
        return createBuilder({
          data: null,
          count: null,
          error: { code: "PGRST103", message: "Requested range not satisfiable" },
        });
      }
      return createBuilder({ data: [], count: 5, error: null });
    });

    const { getPets } = await import("@/features/pets/queries");
    const result = await getPets({ companyId: COMPANY_ID, page: 2 });

    expect(result.total).toBe(5);
    expect(result.data).toEqual([]);
    expect(result.totalPages).toBe(1);
  });

  it("serviços: page=1 continua carregando e page além do limite não lança", async () => {
    const { getServices } = await import("@/features/services/queries");

    fromMock.mockImplementation(() =>
      createBuilder({
        data: [
          {
            id: "s1",
            name: "Banho",
            description: null,
            pricing_mode: "flat",
            price_cents: 4000,
            duration_minutes: 60,
            active: true,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        count: 1,
        error: null,
      }),
    );

    const page1 = await getServices({ companyId: COMPANY_ID, page: 1 });
    expect(page1.total).toBe(1);
    expect(page1.data).toHaveLength(1);

    fromMock.mockReset();
    fromMock.mockImplementation((table: string) => {
      if (table !== "services") {
        throw new Error(`tabela inesperada: ${table}`);
      }
      if (fromMock.mock.calls.filter((call) => call[0] === "services").length <= 1) {
        return createBuilder({
          data: null,
          count: null,
          error: { code: "PGRST103", message: "Requested range not satisfiable" },
        });
      }
      return createBuilder({ data: [], count: 4, error: null });
    });

    const page2 = await getServices({ companyId: COMPANY_ID, page: 2 });
    expect(page2.total).toBe(4);
    expect(page2.data).toEqual([]);
  });

  it("funcionários: PGRST103 não derruba a listagem", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table !== "employees") {
        throw new Error(`tabela inesperada: ${table}`);
      }
      if (fromMock.mock.calls.filter((call) => call[0] === "employees").length <= 1) {
        return createBuilder({
          data: null,
          count: null,
          error: { code: "PGRST103", message: "Requested range not satisfiable" },
        });
      }
      return createBuilder({ data: [], count: 3, error: null });
    });

    const { getEmployees } = await import("@/features/employees/queries");
    const result = await getEmployees({ companyId: COMPANY_ID, page: 2 });

    expect(result.total).toBe(3);
    expect(result.data).toEqual([]);
  });

  it("erro que não é range continua lançando (não mascarar)", async () => {
    fromMock.mockImplementation(() =>
      createBuilder({
        data: null,
        count: null,
        error: { code: "42501", message: "permission denied" },
      }),
    );

    const { getCustomers } = await import("@/features/customers/queries");
    await expect(getCustomers({ companyId: COMPANY_ID, page: 1 })).rejects.toThrow(
      "Não foi possível carregar os tutores.",
    );
  });

  it("busca aplica filtro e page inválida ainda recupera o total filtrado", async () => {
    const orSpyHolders: Array<{ or: ReturnType<typeof vi.fn> }> = [];

    fromMock.mockImplementation(() => {
      const builder = createBuilder({
        data: null,
        count: null,
        error: { code: "PGRST103", message: "Requested range not satisfiable" },
      });
      orSpyHolders.push(builder as never);
      if (orSpyHolders.length > 1) {
        return createBuilder({ data: [], count: 1, error: null });
      }
      return builder;
    });

    const { getCustomers } = await import("@/features/customers/queries");
    const result = await getCustomers({
      companyId: COMPANY_ID,
      page: 2,
      query: "ana",
    });

    expect(result.total).toBe(1);
    expect(orSpyHolders[0]?.or).toHaveBeenCalled();
  });
});
