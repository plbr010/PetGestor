import "server-only";

import {
  DEMO_COMPANY_IDS,
  isDemoCompanyName,
  isDemoOwnerEmail,
} from "@/config/demo-accounts";
import { isAllowlistedPlatformAdminEmail } from "@/config/platform-admin";
import { ATTACHMENTS_BUCKET } from "@/features/attachments/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/security/uuid";

export type DemoAccountCandidate = {
  companyId: string;
  companyName: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  reason: string;
};

export type DemoAccountCleanupResult = {
  deletedCompanies: number;
  deletedUsers: number;
  skippedProtected: number;
  errors: string[];
};

type CompanyRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  company_members: Array<{ user_id: string; role: string }> | null;
};

function pickOwnerUserId(members: CompanyRow["company_members"]): string | null {
  if (!members?.length) {
    return null;
  }

  const owner = members.find((member) => member.role === "owner");
  return owner?.user_id ?? members[0]?.user_id ?? null;
}

function describeDemoReason(companyName: string, ownerEmail: string | null): string {
  if (isDemoCompanyName(companyName)) {
    return "Nome de pet shop demonstrativo";
  }

  if (isDemoOwnerEmail(ownerEmail)) {
    return "E-mail de conta de teste/demo";
  }

  return "ID listado como demo";
}

async function loadUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();

  if (uniqueIds.length === 0) {
    return map;
  }

  const admin = createSupabaseAdminClient();
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error || !data?.users?.length) {
      break;
    }

    for (const user of data.users) {
      if (user.email && uniqueIds.includes(user.id)) {
        map.set(user.id, user.email);
      }
    }

    if (data.users.length < 200) {
      break;
    }

    page += 1;
    if (page > 50) {
      break;
    }
  }

  return map;
}

async function loadProfileNameMap(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, string>();

  if (uniqueIds.length === 0) {
    return map;
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", uniqueIds);

  if (error || !data) {
    return map;
  }

  for (const profile of data) {
    map.set(profile.id, profile.full_name);
  }

  return map;
}

function isProtectedDemoAccount(ownerEmail: string | null): boolean {
  return isAllowlistedPlatformAdminEmail(ownerEmail);
}

function matchesDemoCriteria(
  companyId: string,
  companyName: string,
  ownerEmail: string | null,
): boolean {
  if (DEMO_COMPANY_IDS.includes(companyId)) {
    return true;
  }

  if (isDemoCompanyName(companyName)) {
    return true;
  }

  return isDemoOwnerEmail(ownerEmail);
}

export async function listDemoAccountCandidates(): Promise<DemoAccountCandidate[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select(
      `
        id,
        name,
        created_at,
        created_by,
        company_members (
          user_id,
          role
        )
      `,
    )
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as CompanyRow[];
  const ownerIds = rows
    .map((row) => pickOwnerUserId(row.company_members))
    .filter((id): id is string => Boolean(id));

  const [emailMap, nameMap] = await Promise.all([
    loadUserEmailMap(ownerIds),
    loadProfileNameMap(ownerIds),
  ]);

  const candidates: DemoAccountCandidate[] = [];

  for (const row of rows) {
    const ownerUserId = pickOwnerUserId(row.company_members);
    const ownerEmail = ownerUserId ? (emailMap.get(ownerUserId) ?? null) : null;

    if (!matchesDemoCriteria(row.id, row.name, ownerEmail)) {
      continue;
    }

    if (isProtectedDemoAccount(ownerEmail)) {
      continue;
    }

    candidates.push({
      companyId: row.id,
      companyName: row.name,
      ownerUserId,
      ownerName: ownerUserId ? (nameMap.get(ownerUserId) ?? null) : null,
      ownerEmail,
      createdAt: row.created_at,
      reason: describeDemoReason(row.name, ownerEmail),
    });
  }

  return candidates;
}

async function listStoragePaths(prefix: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const paths: string[] = [];

  async function walk(currentPrefix: string): Promise<void> {
    const { data, error } = await admin.storage.from(ATTACHMENTS_BUCKET).list(currentPrefix, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });

    if (error || !data) {
      return;
    }

    for (const item of data) {
      const fullPath = currentPrefix ? `${currentPrefix}/${item.name}` : item.name;

      if (item.id) {
        paths.push(fullPath);
      } else {
        await walk(fullPath);
      }
    }
  }

  await walk(prefix);
  return paths;
}

async function deleteCompanyStorage(companyId: string): Promise<string | null> {
  const paths = await listStoragePaths(companyId);

  if (paths.length === 0) {
    return null;
  }

  const admin = createSupabaseAdminClient();
  const chunkSize = 100;

  for (let index = 0; index < paths.length; index += chunkSize) {
    const chunk = paths.slice(index, index + chunkSize);
    const { error } = await admin.storage.from(ATTACHMENTS_BUCKET).remove(chunk);

    if (error) {
      return `Falha ao remover arquivos do storage (${companyId}): ${error.message}`;
    }
  }

  return null;
}

async function userHasOtherMemberships(userId: string, excludeCompanyId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .neq("company_id", excludeCompanyId)
    .limit(1);

  if (error) {
    return true;
  }

  return Boolean(data?.length);
}

export async function deleteDemoAccounts(
  companyIds: string[],
): Promise<DemoAccountCleanupResult> {
  const result: DemoAccountCleanupResult = {
    deletedCompanies: 0,
    deletedUsers: 0,
    skippedProtected: 0,
    errors: [],
  };

  const validIds = [...new Set(companyIds.filter((id) => isValidUuid(id)))];

  if (validIds.length === 0) {
    return result;
  }

  const candidates = await listDemoAccountCandidates();
  const candidateMap = new Map(candidates.map((item) => [item.companyId, item]));
  const admin = createSupabaseAdminClient();

  for (const companyId of validIds) {
    const candidate = candidateMap.get(companyId);

    if (!candidate) {
      result.errors.push(`Empresa ${companyId} não é uma conta demo elegível.`);
      continue;
    }

    if (isProtectedDemoAccount(candidate.ownerEmail)) {
      result.skippedProtected += 1;
      continue;
    }

    const { data: members, error: membersError } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId);

    if (membersError) {
      result.errors.push(`Falha ao listar membros de ${candidate.companyName}: ${membersError.message}`);
      continue;
    }

    const memberUserIds = [...new Set((members ?? []).map((member) => member.user_id))];
    const storageError = await deleteCompanyStorage(companyId);

    if (storageError) {
      result.errors.push(storageError);
      continue;
    }

    const { error: purgeCompanyError } = await admin.rpc("purge_company_for_platform_admin", {
      p_company_id: companyId,
    });

    if (purgeCompanyError) {
      result.errors.push(
        `Falha ao apagar empresa ${candidate.companyName}: ${purgeCompanyError.message}`,
      );
      continue;
    }

    result.deletedCompanies += 1;

    for (const userId of memberUserIds) {
      const hasOtherMemberships = await userHasOtherMemberships(userId, companyId);

      if (hasOtherMemberships) {
        continue;
      }

      const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);

      if (deleteUserError) {
        result.errors.push(
          `Empresa removida, mas falha ao apagar usuário ${userId}: ${deleteUserError.message}`,
        );
        continue;
      }

      result.deletedUsers += 1;
    }
  }

  return result;
}
