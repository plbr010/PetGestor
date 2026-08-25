/**
 * Meta Pixel — configuração e helpers (browser).
 * Sem dados clínicos, senhas ou finanças detalhadas do pet shop.
 */

export const META_PIXEL_ENV_KEY = "NEXT_PUBLIC_META_PIXEL_ID" as const;
export const META_PIXEL_DEBUG_ENV_KEY = "NEXT_PUBLIC_META_PIXEL_DEBUG" as const;

/** Query usada após criação real da empresa + trial. */
export const META_CONV_QUERY = "meta_conv";
export const META_CONV_TRIAL_STARTED = "trial_started";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export function readMetaPixelIdFromEnv(
  source: Record<string, string | undefined> = {
    NEXT_PUBLIC_META_PIXEL_ID: process.env.NEXT_PUBLIC_META_PIXEL_ID,
    NEXT_PUBLIC_META_PIXEL_DEBUG: process.env.NEXT_PUBLIC_META_PIXEL_DEBUG,
    NODE_ENV: process.env.NODE_ENV,
  },
): string | null {
  const id = source.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? "";
  if (!id || !/^\d{5,20}$/.test(id)) {
    return null;
  }

  const isProd = source.NODE_ENV === "production";
  const debugEnabled = source.NEXT_PUBLIC_META_PIXEL_DEBUG === "true";

  // Dev/localhost: não envia por padrão (evita poluir Events Manager).
  if (!isProd && !debugEnabled) {
    return null;
  }

  return id;
}

export function isMetaPixelEnabled(): boolean {
  return readMetaPixelIdFromEnv() != null;
}

export function getMetaPixelId(): string | null {
  return readMetaPixelIdFromEnv();
}

const FIRED_PREFIX = "petgestor:meta:";

function hasFired(key: string): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    return window.sessionStorage.getItem(`${FIRED_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

function markFired(key: string): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.sessionStorage.setItem(`${FIRED_PREFIX}${key}`, "1");
  } catch {
    // ignore quota / private mode
  }
}

function callFbq(command: string, ...args: unknown[]): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!isMetaPixelEnabled()) {
    return;
  }
  if (typeof window.fbq !== "function") {
    return;
  }
  window.fbq(command, ...args);
}

/** PageView — sem dedupe de sessão (rota muda); dedupe de Strict Mode fica no provider. */
export function trackMetaPageView(): void {
  callFbq("track", "PageView");
}

/**
 * Cadastro iniciado (dono escolheu o fluxo / abriu o formulário).
 * Evento customizado — documentado em docs/META_PIXEL.md.
 */
export function trackMetaSignupStarted(): void {
  if (hasFired("SignupStarted")) {
    return;
  }
  markFired("SignupStarted");
  callFbq("trackCustom", "SignupStarted");
}

/** Conta/empresa criada com sucesso (não no clique). */
export function trackMetaCompleteRegistration(dedupeKey = "CompleteRegistration"): void {
  if (hasFired(dedupeKey)) {
    return;
  }
  markFired(dedupeKey);
  callFbq("track", "CompleteRegistration");
}

/** Trial de 7 dias ativado (mesmo momento da criação da empresa). */
export function trackMetaStartTrial(dedupeKey = "StartTrial"): void {
  if (hasFired(dedupeKey)) {
    return;
  }
  markFired(dedupeKey);
  callFbq("trackCustom", "StartTrial");
}

/** Usuário entrou no fluxo de pagamento (antes do redirect MP). */
export function trackMetaInitiateCheckout(plan?: string): void {
  const key = plan ? `InitiateCheckout:${plan}` : "InitiateCheckout";
  if (hasFired(key)) {
    return;
  }
  markFired(key);
  callFbq("track", "InitiateCheckout", plan ? { content_name: plan } : undefined);
}

/** Helper genérico — preferir funções tipadas acima. */
export function trackMetaEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  callFbq("track", eventName, params);
}

export function trackMetaCustomEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  callFbq("trackCustom", eventName, params);
}

export function buildDashboardTrialStartedHref(path = "/dashboard"): string {
  const url = new URL(path, "https://petgestor.local");
  url.searchParams.set(META_CONV_QUERY, META_CONV_TRIAL_STARTED);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
