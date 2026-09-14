import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.AUTH_RECOVERY_SECRET ??= "petgestor-test-recovery-secret-32b!";

afterEach(() => {
  cleanup();
});
