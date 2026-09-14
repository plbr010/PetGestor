import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, hasPublicEnv } from "@/lib/env/public-env";
import type { Database } from "@/types/database.types";

export const PATHNAME_HEADER = "x-pathname";

export function buildRequestHeadersWithPathname(request: NextRequest): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return requestHeaders;
}

function nextWithPathname(request: NextRequest): NextResponse {
  const requestHeaders = buildRequestHeadersWithPathname(request);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  return response;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = nextWithPathname(request);

  if (!hasPublicEnv()) {
    return supabaseResponse;
  }

  const env = getPublicEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = nextWithPathname(request);

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });

          Object.entries(headers).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value);
          });
        },
      },
    },
  );

  await supabase.auth.getClaims();

  supabaseResponse.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);

  return supabaseResponse;
}
