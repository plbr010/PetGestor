import "server-only";

import { BillingConfigError, getMercadoPagoAccessToken } from "@/lib/env/server-env";
import type {
  MercadoPagoAuthorizedPayment,
  MercadoPagoPayment,
  MercadoPagoPreapproval,
} from "@/features/subscription/providers/mercado-pago-types";
import {
  buildSanitizedPreapprovalPayloadLog,
  type CreatePendingPreapprovalPayload,
  MP_API_BASE,
} from "@/features/subscription/providers/mercado-pago-types";

const DEFAULT_TIMEOUT_MS = 15_000;

export class MercadoPagoApiError extends Error {
  readonly status: number;
  readonly mpMessage?: string;
  readonly mpError?: string;
  readonly causeDescriptions: string[];

  constructor(
    message: string,
    status: number,
    details?: {
      mpMessage?: string;
      mpError?: string;
      causeDescriptions?: string[];
    },
  ) {
    super(message);
    this.name = "MercadoPagoApiError";
    this.status = status;
    this.mpMessage = details?.mpMessage;
    this.mpError = details?.mpError;
    this.causeDescriptions = details?.causeDescriptions ?? [];
  }
}

type MercadoPagoRequestOptions = {
  operation: string;
};

type MercadoPagoSafeErrorBody = {
  error?: string;
  message?: string;
  status?: number | string;
  causes?: Array<{
    code?: string;
    description?: string;
    data?: string | number | boolean;
  }>;
};

function extractSafeCauseData(value: unknown): string | number | boolean | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return undefined;
}

function extractSafeMercadoPagoErrorBody(data: unknown): MercadoPagoSafeErrorBody {
  if (!data || typeof data !== "object") {
    return {};
  }

  const body = data as Record<string, unknown>;
  const causesRaw = body.cause ?? body.causes;

  const causes = Array.isArray(causesRaw)
    ? causesRaw.flatMap((item) => {
        if (!item || typeof item !== "object") {
          return [];
        }
        const cause = item as Record<string, unknown>;
        const safeCause = {
          code: typeof cause.code === "string" ? cause.code : undefined,
          description:
            typeof cause.description === "string" ? cause.description : undefined,
          data: extractSafeCauseData(cause.data),
        };

        if (safeCause.code || safeCause.description || safeCause.data !== undefined) {
          return [safeCause];
        }

        return [];
      })
    : undefined;

  return {
    error: typeof body.error === "string" ? body.error : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
    status:
      typeof body.status === "number" || typeof body.status === "string"
        ? body.status
        : undefined,
    causes: causes && causes.length > 0 ? causes : undefined,
  };
}

function logMercadoPagoApiError(params: {
  operation: string;
  endpoint: string;
  httpStatus: number;
  body: MercadoPagoSafeErrorBody;
}) {
  console.error("[MercadoPago] API request failed", {
    operation: params.operation,
    endpoint: params.endpoint,
    httpStatus: params.httpStatus,
    error: params.body.error,
    message: params.body.message,
    status: params.body.status,
    causes: params.body.causes,
  });
}

async function mercadoPagoRequest<T>(
  path: string,
  init: RequestInit = {},
  options: MercadoPagoRequestOptions,
): Promise<T> {
  let accessToken: string;

  try {
    accessToken = getMercadoPagoAccessToken();
  } catch (error) {
    if (error instanceof BillingConfigError) {
      throw error;
    }
    throw new BillingConfigError("Mercado Pago não configurado.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${MP_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    const text = await response.text();
    let data: unknown = {};

    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = { message: "invalid_json_response" };
      }
    }

    if (!response.ok) {
      const safeBody = extractSafeMercadoPagoErrorBody(data);
      logMercadoPagoApiError({
        operation: options.operation,
        endpoint: path,
        httpStatus: response.status,
        body: safeBody,
      });
      throw new MercadoPagoApiError("mercado_pago_request_failed", response.status, {
        mpMessage: safeBody.message,
        mpError: safeBody.error,
        causeDescriptions: (safeBody.causes ?? [])
          .map((cause) => cause.description)
          .filter((value): value is string => Boolean(value)),
      });
    }

    return data as T;
  } catch (error) {
    if (process.env.NODE_ENV === "development" && error instanceof Error && error.name === "AbortError") {
      console.error("[MercadoPago] API request timed out", {
        operation: options.operation,
        endpoint: path,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function logPreapprovalPayloadDev(payload: CreatePendingPreapprovalPayload) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log("[MercadoPago][DEV] POST /preapproval payload", buildSanitizedPreapprovalPayloadLog(payload));
}

export async function createPendingSubscription(
  payload: CreatePendingPreapprovalPayload,
): Promise<MercadoPagoPreapproval> {
  logPreapprovalPayloadDev(payload);

  return mercadoPagoRequest<MercadoPagoPreapproval>(
    "/preapproval",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    { operation: "createPendingSubscription" },
  );
}

export async function getSubscription(preapprovalId: string): Promise<MercadoPagoPreapproval> {
  return mercadoPagoRequest<MercadoPagoPreapproval>(
    `/preapproval/${preapprovalId}`,
    {},
    { operation: "getSubscription" },
  );
}

export async function cancelSubscription(preapprovalId: string): Promise<MercadoPagoPreapproval> {
  return mercadoPagoRequest<MercadoPagoPreapproval>(
    `/preapproval/${preapprovalId}`,
    {
      method: "PUT",
      body: JSON.stringify({ status: "canceled" }),
    },
    { operation: "cancelSubscription" },
  );
}

export async function getAuthorizedPayment(
  authorizedPaymentId: string,
): Promise<MercadoPagoAuthorizedPayment> {
  return mercadoPagoRequest<MercadoPagoAuthorizedPayment>(
    `/authorized_payments/${authorizedPaymentId}`,
    {},
    { operation: "getAuthorizedPayment" },
  );
}

export async function getPayment(paymentId: string): Promise<MercadoPagoPayment> {
  return mercadoPagoRequest<MercadoPagoPayment>(
    `/v1/payments/${paymentId}`,
    {},
    { operation: "getPayment" },
  );
}
