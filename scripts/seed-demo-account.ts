#!/usr/bin/env node
import { loadEnvLocal, requireEnv } from "@/features/demo/load-env";
import { seedDemoAccount } from "@/features/demo/seed-demo-account";

loadEnvLocal();

const force = process.argv.includes("--force");

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  await seedDemoAccount(supabaseUrl, anonKey, serviceRoleKey, {
    force,
    log: (message) => console.log(message),
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nErro no seed demo: ${message}\n`);
  process.exit(1);
});
