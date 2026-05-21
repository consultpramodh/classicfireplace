import { describe, expect, it } from "vitest";
import { getEnv } from "../lib/config/serviceops-config";

describe("ServiceOps mode flags", () => {
  it("treats TEST_MODE=true as demo mode for safe local pipeline runs", () => {
    const previousTestMode = process.env.TEST_MODE;
    const previousDemoMode = process.env.DEMO_MODE;
    process.env.TEST_MODE = "true";
    process.env.DEMO_MODE = "false";

    expect(getEnv().testMode).toBe(true);
    expect(getEnv().demoMode).toBe(true);

    if (previousTestMode === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = previousTestMode;
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
  });
});
