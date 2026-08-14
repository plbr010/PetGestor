import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  getOnboardingTourStep,
  isLastOnboardingTourStep,
  ONBOARDING_TOUR_STEP_COUNT,
  ONBOARDING_TOUR_STEPS,
  shouldAutoStartOnboardingTour,
} from "@/features/onboarding-tour/steps";

describe("onboarding tour steps", () => {
  it("define 8 etapas (7 módulos + tela final)", () => {
    expect(ONBOARDING_TOUR_STEP_COUNT).toBe(8);
    expect(ONBOARDING_TOUR_STEPS).toHaveLength(8);
    expect(ONBOARDING_TOUR_STEPS.at(-1)?.targetId).toBeNull();
  });

  it("novo usuário (sem completed_at) deve ver o tutorial", () => {
    expect(shouldAutoStartOnboardingTour(null)).toBe(true);
    expect(shouldAutoStartOnboardingTour(undefined)).toBe(true);
  });

  it("usuário que concluiu não vê automaticamente", () => {
    expect(shouldAutoStartOnboardingTour("2026-08-14T12:00:00.000Z")).toBe(false);
  });

  it("navega etapas e identifica a última", () => {
    expect(getOnboardingTourStep(0)?.id).toBe("welcome");
    expect(isLastOnboardingTourStep(0)).toBe(false);
    expect(isLastOnboardingTourStep(7)).toBe(true);
    expect(getOnboardingTourStep(99)).toBeNull();
  });
});

describe("onboarding tour security surface", () => {
  it("action não aceita user_id do browser", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/onboarding-tour/actions.ts"),
      "utf8",
    );

    expect(source).toContain("requireUser");
    expect(source).toContain('rpc("complete_onboarding_tutorial")');
    expect(source).not.toMatch(/formData\.get\(["']user/);
    expect(source).not.toContain("userId:");
  });

  it("migration usa auth.uid e não aceita user_id arbitrário", () => {
    const migration = readFileSync(
      join(process.cwd(), "supabase/migrations/20260814210000_onboarding_tutorial.sql"),
      "utf8",
    );

    expect(migration).toContain("onboarding_tutorial_completed_at");
    expect(migration).toContain("complete_onboarding_tutorial");
    expect(migration).toContain("auth.uid()");
    expect(migration).not.toMatch(/p_user_id/);
  });

  it("tutorial não é montado no layout admin", () => {
    const adminLayout = readFileSync(
      join(process.cwd(), "src/app/(admin)/layout.tsx"),
      "utf8",
    );
    const dashboardLayout = readFileSync(
      join(process.cwd(), "src/app/(dashboard)/layout.tsx"),
      "utf8",
    );

    expect(adminLayout).not.toContain("OnboardingTour");
    expect(dashboardLayout).toContain("OnboardingTourProvider");
  });

  it("configurações expõe Ver tutorial novamente", () => {
    const settings = readFileSync(
      join(process.cwd(), "src/components/dashboard/profile-settings-content.tsx"),
      "utf8",
    );

    expect(settings).toContain("RestartOnboardingTourCard");
  });

  it("overlay mobile usa card inferior e controles acessíveis", () => {
    const overlay = readFileSync(
      join(
        process.cwd(),
        "src/features/onboarding-tour/components/onboarding-tour-overlay.tsx",
      ),
      "utf8",
    );

    expect(overlay).toContain('role="dialog"');
    expect(overlay).toContain("aria-modal");
    expect(overlay).toContain("Pular tutorial");
    expect(overlay).toContain("safe-area-inset-bottom");
    expect(overlay).toContain("Escape");
    expect(overlay).toContain("readDesktopTargetRect");
  });
});
