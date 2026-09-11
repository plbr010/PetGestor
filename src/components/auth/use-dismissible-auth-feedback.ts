"use client";

import { useEffect, useState } from "react";

import type { AuthActionState } from "@/features/auth/actions";

export function useDismissibleAuthFeedback(state: AuthActionState) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [state]);

  return {
    error: dismissed ? undefined : state.error,
    success: dismissed ? undefined : state.success,
    clear: () => setDismissed(true),
  };
}
