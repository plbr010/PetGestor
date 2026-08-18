import {
  ATTACHMENTS_BUCKET,
  SIGNED_URL_TTL_SECONDS,
} from "@/features/attachments/constants";
import { isPathInCompany } from "@/features/attachments/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function uploadToCompanyStorage(path: string, body: Blob, contentType: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, body, {
    upsert: true,
    contentType,
  });

  return { error };
}

export async function removeFromCompanyStorage(paths: string[]) {
  const supabase = await createSupabaseServerClient();
  const filtered = paths.filter(Boolean);

  if (filtered.length === 0) {
    return { error: null };
  }

  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(filtered);
  return { error };
}

export async function createSignedStorageUrl(companyId: string, path: string | null | undefined) {
  if (!path || !isPathInCompany(companyId, path)) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }

  return data.signedUrl;
}

export async function createSignedStorageUrls(
  companyId: string,
  paths: Array<string | null | undefined>,
) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const entries = await Promise.all(
    unique.map(async (path) => [path, await createSignedStorageUrl(companyId, path)] as const),
  );

  return new Map(entries);
}
