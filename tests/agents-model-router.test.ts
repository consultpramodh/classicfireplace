import { describe, expect, it } from "vitest";
import { routeServiceOpsModel } from "../lib/agents/model-router";

describe("ServiceOps model router", () => {
  it("routes low-risk formatting to the fast tier", () => {
    const route = routeServiceOpsModel("intake_summary");
    expect(route.risk).toBe("low");
    expect(route.reasoningEffort).toBe("none");
  });

  it("routes ordinary customer matching to the balanced tier", () => {
    const route = routeServiceOpsModel("customer_match");
    expect(route.risk).toBe("medium");
    expect(route.reasoningEffort).toBe("low");
  });

  it("routes ambiguous identity conflicts to the strong tier", () => {
    const route = routeServiceOpsModel("ambiguous_customer_match");
    expect(route.risk).toBe("high");
    expect(route.reasoningEffort).toBe("high");
  });
});
