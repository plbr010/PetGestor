import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  DEMO_ACCOUNT,
  DEMO_APPOINTMENT_SLOTS,
  DEMO_CUSTOMERS,
  DEMO_EMPLOYEES,
  DEMO_FINANCE,
  DEMO_INVENTORY,
  DEMO_PETS,
  DEMO_SERVICE_PACKAGE,
  DEMO_SERVICES,
  DEMO_TIMEZONE,
} from "@/config/demo-seed-data";
import { getDefaultWorkingHours, workingHoursToRpcPayload } from "@/features/employees/utils";
import { buildRpcItemsPayload, buildRpcPaymentsPayload } from "@/features/pos/cart-engine";
import { sizePricesToRpcPayload } from "@/features/services/utils";
import {
  addDaysToDateString,
  formatDateInTimezone,
  resolveFutureLocalDateTime,
} from "@/features/demo/seed-scheduling";
import { localDateTimeToUtcIso } from "@/lib/timezone";
import type { Database } from "@/types/database.types";

export type SeedDemoOptions = {
  force?: boolean;
  log?: (message: string) => void;
};

export type SeedDemoResult = {
  userId: string;
  companyId: string;
  email: string;
  password: string;
  seeded: boolean;
  skipped: boolean;
};

type DbClient = SupabaseClient<Database>;
type IdMap = Record<string, string>;

function logStep(log: SeedDemoOptions["log"], message: string) {
  log?.(`  • ${message}`);
}

function assertData<T>(value: T | null | undefined, label: string): T {
  if (value == null) {
    throw new Error(`Falha ao criar ${label}.`);
  }

  return value;
}

async function ensureDemoUser(
  admin: DbClient,
  log?: SeedDemoOptions["log"],
): Promise<{ userId: string; created: boolean }> {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users?.find(
    (user) => user.email?.toLowerCase() === DEMO_ACCOUNT.email.toLowerCase(),
  );

  if (existing) {
    logStep(log, `Usuário demo já existe (${DEMO_ACCOUNT.email})`);
    return { userId: existing.id, created: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: DEMO_ACCOUNT.email,
    password: DEMO_ACCOUNT.password,
    email_confirm: true,
    user_metadata: { full_name: DEMO_ACCOUNT.ownerName },
  });

  if (error || !data.user) {
    throw new Error(`Não foi possível criar usuário demo: ${error?.message ?? "erro desconhecido"}`);
  }

  logStep(log, `Usuário demo criado (${DEMO_ACCOUNT.email})`);
  return { userId: data.user.id, created: true };
}

async function createAuthenticatedClient(
  supabaseUrl: string,
  anonKey: string,
): Promise<DbClient> {
  const client = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await client.auth.signInWithPassword({
    email: DEMO_ACCOUNT.email,
    password: DEMO_ACCOUNT.password,
  });

  if (error) {
    throw new Error(`Login demo falhou: ${error.message}`);
  }

  return client;
}

async function ensureCompany(
  client: DbClient,
  userId: string,
  log?: SeedDemoOptions["log"],
): Promise<string> {
  const { data: membership } = await client
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (membership?.company_id) {
    logStep(log, "Empresa demo já vinculada ao usuário");
    return membership.company_id;
  }

  const { data: companyId, error } = await client.rpc("complete_onboarding", {
    p_full_name: DEMO_ACCOUNT.ownerName,
    p_company_name: DEMO_ACCOUNT.companyName,
    p_phone: DEMO_ACCOUNT.phone,
  });

  if (error || !companyId) {
    throw new Error(`Onboarding demo falhou: ${error?.message ?? "erro desconhecido"}`);
  }

  logStep(log, `Empresa "${DEMO_ACCOUNT.companyName}" criada`);
  return companyId;
}

async function extendDemoTrial(admin: DbClient, companyId: string, log?: SeedDemoOptions["log"]) {
  const trialEndsAt = new Date();
  trialEndsAt.setFullYear(trialEndsAt.getFullYear() + 1);

  const { error } = await admin
    .from("company_subscriptions")
    .update({
      status: "trialing",
      trial_ends_at: trialEndsAt.toISOString(),
    })
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`Não foi possível estender trial demo: ${error.message}`);
  }

  logStep(log, "Trial estendido por 1 ano");
}

async function hasExistingSeedData(client: DbClient, companyId: string): Promise<boolean> {
  const { count } = await client
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null);

  return (count ?? 0) > 0;
}

async function seedCustomers(
  client: DbClient,
  companyId: string,
  userId: string,
): Promise<IdMap> {
  const ids: IdMap = {};

  for (const customer of DEMO_CUSTOMERS) {
    const { data, error } = await client
      .from("customers")
      .insert({
        company_id: companyId,
        created_by: userId,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        notes: customer.notes,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Tutor ${customer.name}: ${error?.message ?? "erro"}`);
    }

    ids[customer.key] = data.id;
  }

  return ids;
}

async function seedPets(
  client: DbClient,
  companyId: string,
  userId: string,
  customerIds: IdMap,
): Promise<IdMap> {
  const ids: IdMap = {};

  for (const pet of DEMO_PETS) {
    const customerId = customerIds[pet.customerKey];

    if (!customerId) {
      throw new Error(`Tutor não encontrado para pet ${pet.name}`);
    }

    const { data, error } = await client
      .from("pets")
      .insert({
        company_id: companyId,
        customer_id: customerId,
        created_by: userId,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        sex: pet.sex,
        weight_kg: pet.weightKg,
        color: pet.color,
        allergies: pet.allergies,
        notes: pet.notes,
        important_notes: pet.importantNotes,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Pet ${pet.name}: ${error?.message ?? "erro"}`);
    }

    ids[pet.key] = data.id;
  }

  return ids;
}

async function seedServices(client: DbClient): Promise<IdMap> {
  const ids: IdMap = {};

  for (const service of DEMO_SERVICES) {
    const { data, error } = await client.rpc("create_service_with_prices", {
      p_name: service.name,
      p_description: service.description,
      p_pricing_mode: service.pricingMode,
      p_price_cents: service.pricingMode === "fixed" ? service.priceCents : null,
      p_duration_minutes:
        service.pricingMode === "fixed"
          ? service.durationMinutes
          : Math.min(...service.sizePrices.map((row) => row.durationMinutes)),
      p_active: true,
      p_size_prices:
        service.pricingMode === "by_size"
          ? sizePricesToRpcPayload([...service.sizePrices])
          : null,
    });

    if (error || !data) {
      throw new Error(`Serviço ${service.name}: ${error?.message ?? "erro"}`);
    }

    ids[service.key] = String(data);
  }

  return ids;
}

async function seedEmployees(client: DbClient, serviceIds: IdMap): Promise<IdMap> {
  const ids: IdMap = {};
  const workingHours = workingHoursToRpcPayload(getDefaultWorkingHours());

  for (const employee of DEMO_EMPLOYEES) {
    const serviceIdsList = employee.serviceKeys.map((key) => serviceIds[key]).filter(Boolean);

    const { data, error } = await client.rpc("create_employee_with_schedule", {
      p_name: employee.name,
      p_phone: employee.phone,
      p_email: employee.email,
      p_job_title: employee.jobTitle,
      p_notes: null,
      p_active: true,
      p_can_be_scheduled: "canBeScheduled" in employee ? employee.canBeScheduled : true,
      p_service_ids: serviceIdsList,
      p_working_hours: workingHours,
    });

    if (error || !data) {
      throw new Error(`Funcionário ${employee.name}: ${error?.message ?? "erro"}`);
    }

    ids[employee.key] = String(data);
  }

  return ids;
}

async function seedInventory(
  client: DbClient,
  companyId: string,
  userId: string,
): Promise<{ categoryIds: IdMap; supplierIds: IdMap; productIds: IdMap }> {
  const categoryIds: IdMap = {};
  const supplierIds: IdMap = {};
  const productIds: IdMap = {};

  for (const category of DEMO_INVENTORY.categories) {
    const { data, error } = await client
      .from("product_categories")
      .insert({
        company_id: companyId,
        name: category.name,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Categoria ${category.name}: ${error?.message ?? "erro"}`);
    }

    categoryIds[category.key] = data.id;
  }

  for (const supplier of DEMO_INVENTORY.suppliers) {
    const { data, error } = await client
      .from("inventory_suppliers")
      .insert({
        company_id: companyId,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        notes: supplier.notes,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Fornecedor ${supplier.name}: ${error?.message ?? "erro"}`);
    }

    supplierIds[supplier.key] = data.id;
  }

  for (const product of DEMO_INVENTORY.products) {
    const categoryId = categoryIds[product.categoryKey];

    const { data, error } = await client
      .from("products")
      .insert({
        company_id: companyId,
        name: product.name,
        sku: product.sku,
        category_id: categoryId,
        unit: product.unit,
        cost_price_cents: product.costPriceCents,
        sale_price_cents: product.salePriceCents,
        current_stock: 0,
        minimum_stock: product.minimumStock,
        active: true,
        track_stock: true,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Produto ${product.name}: ${error?.message ?? "erro"}`);
    }

    productIds[product.key] = data.id;

    const supplierId = supplierIds.petmax;
    const movementKey = crypto.randomUUID();

    const { error: stockError } = await client.rpc("register_stock_movement", {
      p_product_id: data.id,
      p_type: "entry",
      p_quantity: product.initialStock,
      p_idempotency_key: movementKey,
      p_unit_cost_cents: product.costPriceCents,
      p_reason: "purchase",
      p_notes: "Estoque inicial da conta demo",
      p_supplier_id: supplierId,
      p_batch_code: `LOTE-DEMO-${product.sku}`,
    });

    if (stockError) {
      throw new Error(`Estoque ${product.name}: ${stockError.message}`);
    }
  }

  return { categoryIds, supplierIds, productIds };
}

async function seedServiceRecipes(
  client: DbClient,
  serviceIds: IdMap,
  productIds: IdMap,
) {
  const banhoTosaId = serviceIds["banho-tosa"];
  const shampooId = productIds.shampoo;
  const condicionadorId = productIds.condicionador;

  if (!banhoTosaId || !shampooId || !condicionadorId) {
    return;
  }

  const { error } = await client.rpc("replace_service_product_recipes", {
    p_service_id: banhoTosaId,
    p_items: [
      { product_id: shampooId, quantity: 0.05 },
      { product_id: condicionadorId, quantity: 0.03 },
    ],
  });

  if (error) {
    throw new Error(`Receita de insumos: ${error.message}`);
  }
}

async function seedServicePackage(
  client: DbClient,
  serviceIds: IdMap,
  customerIds: IdMap,
  petIds: IdMap,
): Promise<string | null> {
  const items = DEMO_SERVICE_PACKAGE.items.map((item) => ({
    service_id: assertData(serviceIds[item.serviceKey], "serviço do pacote"),
    quantity: item.quantity,
  }));

  const { data: packageId, error } = await client.rpc("create_service_package_with_items", {
    p_name: DEMO_SERVICE_PACKAGE.name,
    p_description: DEMO_SERVICE_PACKAGE.description,
    p_price_cents: DEMO_SERVICE_PACKAGE.priceCents,
    p_validity_days: DEMO_SERVICE_PACKAGE.validityDays,
    p_active: true,
    p_items: items,
  });

  if (error || !packageId) {
    throw new Error(`Pacote de serviços: ${error?.message ?? "erro"}`);
  }

  const customerId = customerIds.fernanda;
  const petId = petIds.nina;

  if (!customerId || !petId) {
    return String(packageId);
  }

  const { error: sellError } = await client.rpc("sell_customer_service_package", {
    p_package_id: String(packageId),
    p_customer_id: customerId,
    p_pet_id: petId,
    p_starts_at: new Date().toISOString(),
    p_financial_status: "paid",
    p_payment_method: "credit_card",
  });

  if (sellError) {
    throw new Error(`Venda de pacote: ${sellError.message}`);
  }

  return String(packageId);
}

async function seedAppointments(
  client: DbClient,
  companyId: string,
  userId: string,
  petIds: IdMap,
  serviceIds: IdMap,
  employeeIds: IdMap,
): Promise<string[]> {
  const appointmentIds: string[] = [];
  const petSizeByKey = Object.fromEntries(DEMO_PETS.map((pet) => [pet.key, pet.size]));

  for (const slot of DEMO_APPOINTMENT_SLOTS) {
    const scheduledStart = resolveFutureLocalDateTime(slot.time);

    const { data, error } = await client.rpc("create_appointment", {
      p_pet_id: assertData(petIds[slot.petKey], "pet"),
      p_service_id: assertData(serviceIds[slot.serviceKey], "serviço"),
      p_employee_id: assertData(employeeIds[slot.employeeKey], "funcionário"),
      p_scheduled_start: scheduledStart,
      p_pet_size: petSizeByKey[slot.petKey] ?? null,
      p_notes: "Agendamento demonstrativo",
    });

    if (error || !data) {
      throw new Error(`Agendamento ${slot.petKey}: ${error?.message ?? "erro"}`);
    }

    appointmentIds.push(String(data));
  }

  // Recorrência semanal para Thor (3 ocorrências futuras)
  const thorPetId = petIds.thor;
  const banhoServiceId = serviceIds["banho-tosa"];
  const rafaelaId = employeeIds.rafaela;

  if (thorPetId && banhoServiceId && rafaelaId) {
    const today = formatDateInTimezone(new Date(), DEMO_TIMEZONE);
    const nextWeek = addDaysToDateString(today, 7);
    const recurrenceStart = resolveFutureLocalDateTime("09:00");
    const recurrenceStart2 = localDateTimeToUtcIso(nextWeek, "09:00", DEMO_TIMEZONE);

    const { data: recurrence, error: recurrenceError } = await client
      .from("appointment_recurrences")
      .insert({
        company_id: companyId,
        frequency: "weekly",
        interval_value: 1,
        max_occurrences: 3,
        created_by: userId,
        active: true,
      })
      .select("id")
      .single();

    if (!recurrenceError && recurrence) {
      const starts = [recurrenceStart, recurrenceStart2];
      const thirdWeek = addDaysToDateString(nextWeek, 7);
      starts.push(localDateTimeToUtcIso(thirdWeek, "09:00", DEMO_TIMEZONE));

      for (let index = 0; index < starts.length; index += 1) {
        const { data: aptId, error: aptError } = await client.rpc("create_appointment", {
          p_pet_id: thorPetId,
          p_service_id: banhoServiceId,
          p_employee_id: rafaelaId,
          p_scheduled_start: starts[index]!,
          p_pet_size: "large",
          p_notes: "Recorrência demo — banho semanal",
        });

        if (!aptError && aptId) {
          await client
            .from("appointments")
            .update({
              recurrence_id: recurrence.id,
              recurrence_index: index + 1,
            })
            .eq("id", String(aptId))
            .eq("company_id", companyId);

          appointmentIds.push(String(aptId));
        }
      }
    }
  }

  return appointmentIds;
}

async function seedWaitlistAndTimeBlocks(
  client: DbClient,
  companyId: string,
  userId: string,
  petIds: IdMap,
  serviceIds: IdMap,
  employeeIds: IdMap,
  customerIds: IdMap,
) {
  const today = formatDateInTimezone(new Date(), DEMO_TIMEZONE);
  const preferredDate = addDaysToDateString(today, 3);

  await client.from("appointment_waitlist").insert({
    company_id: companyId,
    customer_id: assertData(customerIds.roberto, "tutor"),
    pet_id: assertData(petIds.bob, "pet"),
    service_id: assertData(serviceIds["tosa-higienica"], "serviço"),
    preferred_employee_id: employeeIds.rafaela ?? null,
    preferred_date: preferredDate,
    preferred_period: "morning",
    notes: "Lista de espera demo — cliente flexível no horário.",
    created_by: userId,
  });

  const blockDate = addDaysToDateString(today, 1);
  const blockStart = localDateTimeToUtcIso(blockDate, "12:00", DEMO_TIMEZONE);
  const blockEnd = localDateTimeToUtcIso(blockDate, "13:00", DEMO_TIMEZONE);

  await client.from("schedule_time_blocks").insert({
    company_id: companyId,
    employee_id: assertData(employeeIds.rafaela, "funcionário"),
    block_start: blockStart,
    block_end: blockEnd,
    reason: "Almoço / pausa demonstrativa",
    created_by: userId,
  });
}

async function seedServiceOrders(client: DbClient, appointmentIds: string[]) {
  if (appointmentIds.length === 0) {
    return;
  }

  const [first, second, third] = appointmentIds;

  if (first) {
    const { data: order1, error } = await client.rpc("check_in_appointment", {
      p_appointment_id: first,
      p_intake_notes: "Check-in demo — aguardando banho.",
    });
    if (error) throw new Error(`Check-in 1: ${error.message}`);
    void order1;
  }

  if (second) {
    const { data: order2, error: checkInError } = await client.rpc("check_in_appointment", {
      p_appointment_id: second,
      p_intake_notes: "Consulta em andamento.",
    });
    if (checkInError) throw new Error(`Check-in 2: ${checkInError.message}`);

    if (order2) {
      const { error: startError } = await client.rpc("start_service_order", {
        p_service_order_id: String(order2),
      });
      if (startError) throw new Error(`Início atendimento 2: ${startError.message}`);
    }
  }

  if (third) {
    const { data: order3, error: checkInError } = await client.rpc("check_in_appointment", {
      p_appointment_id: third,
      p_intake_notes: "Hidratação quase finalizada.",
    });
    if (checkInError) throw new Error(`Check-in 3: ${checkInError.message}`);

    if (order3) {
      await client.rpc("start_service_order", { p_service_order_id: String(order3) });
      const { error: readyError } = await client.rpc("mark_service_order_ready", {
        p_service_order_id: String(order3),
      });
      if (readyError) throw new Error(`Pronto atendimento 3: ${readyError.message}`);
    }
  }

  // Quarto agendamento: fluxo completo até entrega
  const fourth = appointmentIds[3];
  if (fourth) {
    const { data: order4, error: checkInError } = await client.rpc("check_in_appointment", {
      p_appointment_id: fourth,
    });
    if (!checkInError && order4) {
      await client.rpc("start_service_order", { p_service_order_id: String(order4) });
      await client.rpc("mark_service_order_ready", { p_service_order_id: String(order4) });
      const { error: completeError } = await client.rpc("complete_service_order", {
        p_service_order_id: String(order4),
        p_payment_method: "pix",
      });
      if (completeError) {
        throw new Error(`Conclusão atendimento 4: ${completeError.message}`);
      }
    }
  }
}

async function seedFinance(
  client: DbClient,
  companyId: string,
  userId: string,
) {
  const now = new Date().toISOString();

  for (const income of DEMO_FINANCE.incomes) {
    const { error } = await client.from("financial_entries").insert({
      company_id: companyId,
      entry_type: "income",
      status: income.status,
      source_type: "manual",
      description: income.description,
      category: income.category,
      amount_cents: income.amountCents,
      payment_method: income.paymentMethod,
      paid_at: income.status === "paid" ? now : null,
      created_by: userId,
    });

    if (error) {
      throw new Error(`Receita demo: ${error.message}`);
    }
  }

  for (const expense of DEMO_FINANCE.expenses) {
    const { error } = await client.from("financial_entries").insert({
      company_id: companyId,
      entry_type: "expense",
      status: expense.status,
      source_type: "manual",
      description: expense.description,
      category: expense.category,
      amount_cents: expense.amountCents,
      payment_method: expense.paymentMethod,
      paid_at: expense.status === "paid" ? now : null,
      created_by: userId,
    });

    if (error) {
      throw new Error(`Despesa demo: ${error.message}`);
    }
  }
}

async function seedPos(
  client: DbClient,
  customerIds: IdMap,
  productIds: IdMap,
) {
  const racaoId = productIds["racao-premium"];
  const coleiraId = productIds.coleira;

  if (!racaoId || !coleiraId) {
    return;
  }

  await client.rpc("open_cash_session", {
    p_opening_balance_cents: 15000,
    p_notes: "Abertura de caixa demo",
  });

  const saleKey = crypto.randomUUID();
  const paymentKey = crypto.randomUUID();

  const { data: saleId, error } = await client.rpc("complete_product_sale", {
    p_idempotency_key: saleKey,
    p_items: buildRpcItemsPayload([
      {
        productId: racaoId,
        name: "Ração Premium 10kg",
        unit: "unit",
        unitPriceCents: 18900,
        costPriceCents: 14500,
        quantity: 1,
        availableStock: 12,
        trackStock: true,
      },
      {
        productId: coleiraId,
        name: "Coleira Ajustável M",
        unit: "unit",
        unitPriceCents: 2490,
        costPriceCents: 1200,
        quantity: 1,
        availableStock: 3,
        trackStock: true,
      },
    ]),
    p_payments: buildRpcPaymentsPayload([
      {
        amountCents: 21390,
        paymentMethod: "pix",
        idempotencyKey: paymentKey,
      },
    ]),
    p_customer_id: customerIds.ana ?? null,
  });

  if (error) {
    throw new Error(`Venda PDV demo: ${error.message}`);
  }

  // Venda parcialmente paga
  const partialSaleKey = crypto.randomUUID();
  const partialPaymentKey = crypto.randomUUID();

  const { data: partialSaleId, error: partialError } = await client.rpc("complete_product_sale", {
    p_idempotency_key: partialSaleKey,
    p_items: buildRpcItemsPayload([
      {
        productId: coleiraId,
        name: "Coleira Ajustável M",
        unit: "unit",
        unitPriceCents: 2490,
        costPriceCents: 1200,
        quantity: 1,
        availableStock: 2,
        trackStock: true,
      },
    ]),
    p_payments: buildRpcPaymentsPayload([
      {
        amountCents: 1000,
        paymentMethod: "cash",
        idempotencyKey: partialPaymentKey,
      },
    ]),
    p_customer_id: null,
  });

  if (partialError) {
    throw new Error(`Venda parcial demo: ${partialError.message}`);
  }

  if (partialSaleId) {
    await client.rpc("register_sale_payment", {
      p_sale_id: String(partialSaleId),
      p_amount_cents: 1490,
      p_payment_method: "pix",
      p_idempotency_key: crypto.randomUUID(),
    });
  }

  void saleId;
}

async function seedSettings(client: DbClient, companyId: string, userId: string) {
  await client.from("company_notification_settings").upsert(
    {
      company_id: companyId,
      appointment_confirmation_enabled: true,
      reminder_24h_enabled: true,
      reminder_2h_enabled: true,
      pet_ready_enabled: true,
      customer_same_day_reminder_enabled: true,
      employee_same_day_reminder_enabled: true,
      employee_reminder_2h_enabled: true,
      same_day_reminder_time: "08:00",
    },
    { onConflict: "company_id" },
  );

  await client.rpc("upsert_onboarding_progress", {
    p_company_id: companyId,
    p_patch: {
      mark_started: true,
      welcome_seen: true,
      guided_started: true,
      guided_skipped: true,
      workflow_viewed: true,
      finance_viewed: true,
      completed: true,
      checklist_dismissed: true,
    },
  });

  await client.from("app_notifications").insert([
    {
      company_id: companyId,
      user_id: userId,
      type: "stock_low",
      severity: "warning",
      title: "Estoque baixo",
      message: "Coleira Ajustável M está com estoque baixo.",
      entity_type: "product",
      href: "/dashboard/estoque",
      required_permission: "inventory.view",
      dedupe_key: `demo:stock_low:${companyId}`,
      is_read: false,
    },
    {
      company_id: companyId,
      user_id: null,
      type: "payment_pending",
      severity: "info",
      title: "Pagamento pendente",
      message: "Há receitas aguardando confirmação de pagamento.",
      href: "/dashboard/financeiro",
      required_permission: "finance.view",
      dedupe_key: `demo:payment_pending:${companyId}`,
      is_read: false,
    },
  ]);
}

async function seedOperationalData(
  client: DbClient,
  admin: DbClient,
  companyId: string,
  userId: string,
  log?: SeedDemoOptions["log"],
) {
  logStep(log, "Cadastrando tutores e pets…");
  const customerIds = await seedCustomers(client, companyId, userId);
  const petIds = await seedPets(client, companyId, userId, customerIds);

  logStep(log, "Cadastrando serviços e equipe…");
  const serviceIds = await seedServices(client);
  const employeeIds = await seedEmployees(client, serviceIds);

  logStep(log, "Cadastrando estoque e receitas de insumos…");
  const { productIds } = await seedInventory(client, companyId, userId);
  await seedServiceRecipes(client, serviceIds, productIds);

  logStep(log, "Cadastrando pacotes de serviços…");
  await seedServicePackage(client, serviceIds, customerIds, petIds);

  logStep(log, "Criando agenda, lista de espera e bloqueios…");
  const appointmentIds = await seedAppointments(
    client,
    companyId,
    userId,
    petIds,
    serviceIds,
    employeeIds,
  );
  await seedWaitlistAndTimeBlocks(
    client,
    companyId,
    userId,
    petIds,
    serviceIds,
    employeeIds,
    customerIds,
  );

  logStep(log, "Simulando atendimentos em diferentes estágios…");
  await seedServiceOrders(client, appointmentIds);

  logStep(log, "Lançando financeiro e PDV…");
  await seedFinance(client, companyId, userId);
  await seedPos(client, customerIds, productIds);

  logStep(log, "Configurando notificações e onboarding…");
  await seedSettings(client, companyId, userId);

  // Garantir timezone da empresa
  await admin.from("companies").update({ timezone: DEMO_TIMEZONE }).eq("id", companyId);
}

export async function seedDemoAccount(
  supabaseUrl: string,
  anonKey: string,
  serviceRoleKey: string,
  options: SeedDemoOptions = {},
): Promise<SeedDemoResult> {
  const log = options.log ?? console.log;

  const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  log("PetGestor — seed da conta demonstrativa");
  log("");

  const { userId } = await ensureDemoUser(admin, log);
  const client = await createAuthenticatedClient(supabaseUrl, anonKey);
  const companyId = await ensureCompany(client, userId, log);

  await extendDemoTrial(admin, companyId, log);

  const alreadySeeded = await hasExistingSeedData(client, companyId);

  if (alreadySeeded && !options.force) {
    log("");
    log("Dados operacionais já existem — seed ignorado (use --force para recriar).");
    return {
      userId,
      companyId,
      email: DEMO_ACCOUNT.email,
      password: DEMO_ACCOUNT.password,
      seeded: false,
      skipped: true,
    };
  }

  if (alreadySeeded && options.force) {
    logStep(log, "Modo --force: dados existentes serão complementados (não há wipe automático).");
  }

  await seedOperationalData(client, admin, companyId, userId, log);

  log("");
  log("Conta demo pronta!");
  log(`  E-mail:   ${DEMO_ACCOUNT.email}`);
  log(`  Senha:    ${DEMO_ACCOUNT.password}`);
  log(`  Empresa:  ${DEMO_ACCOUNT.companyName}`);
  log(`  Company:  ${companyId}`);
  log("");
  log("Acesse /entrar e explore todas as áreas do dashboard.");

  return {
    userId,
    companyId,
    email: DEMO_ACCOUNT.email,
    password: DEMO_ACCOUNT.password,
    seeded: true,
    skipped: false,
  };
}
