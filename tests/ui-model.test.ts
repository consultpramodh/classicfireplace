import { describe, expect, it } from "vitest";
import type { IntakeRow } from "../lib/serviceops/types";
import {
  buildUiRequests,
  canCreateWorkOrder,
  currentMonthRequests,
  deriveUiStatus,
  filterUiRequests,
  workOrderGate
} from "../lib/serviceops/ui-model";

function row(overrides: Partial<IntakeRow>): IntakeRow {
  return {
    id: "base",
    sourceRow: 1,
    submittedAt: "2026-05-01T09:00:00",
    firstName: "Dana",
    lastName: "Morris",
    phone: "416-555-0134",
    altPhone: "",
    email: "dana@example.com",
    street: "44 King St E",
    city: "Toronto",
    province: "ON",
    postalCode: "M5C 1G8",
    country: "Canada",
    preferredDays: "Monday",
    makeModelAge: "Napoleon B36, 8 years",
    details: "Annual fireplace service",
    anythingElse: "",
    pipelineState: "NEW",
    needsReview: false,
    lastError: "",
    strivenCustomerId: "",
    strivenOppId: "",
    strivenSoId: "",
    salesOrderNumber: "",
    opportunityStage: "",
    taskMatched: false,
    ...overrides
  };
}

describe("ServiceOps UI model", () => {
  it("keeps queues newest first after filtering", () => {
    const rows = buildUiRequests([
      row({ id: "old", sourceRow: 2, submittedAt: "2026-05-02T09:00:00", firstName: "Old", phone: "416-555-0101", email: "old@example.com" }),
      row({ id: "new", sourceRow: 3, submittedAt: "2026-05-05T09:00:00", firstName: "New", phone: "416-555-0202", email: "new@example.com" })
    ]);

    expect(rows.map((item) => item.id)).toEqual(["new", "old"]);
    expect(filterUiRequests(rows, { query: "o" }).map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("scopes to the current month when matching rows exist", () => {
    const rows = buildUiRequests([
      row({ id: "april", submittedAt: "2026-04-29T09:00:00" }),
      row({ id: "may", submittedAt: "2026-05-03T09:00:00" })
    ]);

    expect(currentMonthRequests(rows, new Date("2026-05-06T12:00:00")).map((item) => item.id)).toEqual(["may"]);
  });

  it("derives next operational status from live/cache fields", () => {
    expect(deriveUiStatus(row({ needsReview: true }))).toBe("attention");
    expect(deriveUiStatus(row({ strivenCustomerId: "61142" }))).toBe("customer");
    expect(deriveUiStatus(row({ pipelineState: "SERVICE_INTELLIGENCE_READY" }))).toBe("intelligence");
    expect(deriveUiStatus(row({ pipelineState: "TECH_AND_AREA_RECOMMENDED" }))).toBe("techArea");
    expect(deriveUiStatus(row({ pipelineState: "DATE_RECOMMENDED" }))).toBe("date");
    expect(deriveUiStatus(row({ strivenOppId: "1087" }))).toBe("opportunity");
    expect(deriveUiStatus(row({ strivenOppId: "1087", opportunityStage: "Approved for SWO" }))).toBe("approved");
    expect(deriveUiStatus(row({ strivenSoId: "900", salesOrderNumber: "SO-900" }))).toBe("workOrder");
    expect(deriveUiStatus(row({ taskMatched: true }))).toBe("completed");
  });

  it("blocks work order creation until all gate checks pass", () => {
    const ready = buildUiRequests([
      row({ id: "ready", strivenCustomerId: "61142", strivenOppId: "1087", opportunityStage: "Approved for SWO", pipelineState: "AWAITING_SWO_APPROVAL" })
    ])[0];
    const duplicate = buildUiRequests([
      row({ id: "dup", strivenCustomerId: "61142", strivenOppId: "1087", strivenSoId: "77", opportunityStage: "Approved for SWO" })
    ])[0];

    expect(workOrderGate(ready).every((check) => check.ok)).toBe(true);
    expect(canCreateWorkOrder(ready)).toBe(true);
    expect(canCreateWorkOrder(duplicate)).toBe(false);
  });
});
