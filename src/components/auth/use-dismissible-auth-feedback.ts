"use client";

import { useState } from "react";

import type { AuthActionState } from "@/features/auth/actions";

export function useDismissibleAuthFeedback(state: AuthActionState) {
  const [dismissed, setDismissed] = useState(false);
  const [seenState, setSeenState] = useState(state);

  if (state !== seenState) {
    setSeenState(state);
    setDismissed(false);
  }

  return {
    error: dismissed ? undefined : state.error,
    success: dismissed ? undefined : state.success,
    clear: () => setDismissed(true),
  };
}
