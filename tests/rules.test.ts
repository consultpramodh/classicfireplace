import { describe, expect, it } from "vitest";
import { PIPELINE_STATE } from "../lib/config/serviceops-config";
import type { IntakeRow } from "../lib/serviceops/types";
import { canCreateSalesOrder, matchCustomer, resolvePreferredDayIds, shouldCreateSalesOrderFromStage } from "../lib/serviceops/rules";

const row: IntakeRow = {
  id: "x",
  sourceRow: 2,
  submittedAt: "",
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
  makeModelAge: "Napoleon B36",
  details: "",
  anythingElse: "",
  pipelineState: PIPELINE_STATE.opportunityCreated,
  needsReview: false,
  lastError: "",
  strivenCustomerId: "61142",
  strivenOppId: "1087",
  strivenSoId: "",
  salesOrderNumber: "",
  opportunityStage: "Approved for SWO",
  taskMatched: false
};

describe("preferred day mapping", () => {
  it("maps preferred days to Striven option IDs", () => {
    expect(resolvePreferredDayIds("No Preference, Monday; friday")).toEqual([511, 512, 516]);
  });
});

describe("duplicate detection", () => {
  it("matches by email, then phone/address as needed", () => {
    expect(matchCustomer(row, [{ customerId: 10, email: "DANA@example.com" }])).toEqual({ customerId: 10, reason: "email" });
    expect(matchCustomer({ ...row, email: "" }, [{ customerId: 11, phone: "4165550134" }])).toEqual({ customerId: 11, reason: "phone" });
    expect(matchCustomer({ ...row, email: "", phone: "" }, [{ customerId: 12, street: "44 King St E", city: "Toronto", postalCode: "M5C1G8" }])).toEqual({ customerId: 12, reason: "address-postal" });
  });
});

describe("stage-gating rule", () => {
  it("only allows sales orders from Approved for SWO stage", () => {
    expect(shouldCreateSalesOrderFromStage("New Request")).toBe(false);
    expect(shouldCreateSalesOrderFromStage("Approved for SWO")).toBe(true);
  });

  it("blocks duplicates, missing IDs, wrong stage, and zero pricing", () => {
    expect(canCreateSalesOrder({ row: { ...row, opportunityStage: "New Request" }, workOrders: [], itemPrice: 249 }).ok).toBe(false);
    expect(canCreateSalesOrder({ row: { ...row, strivenOppId: "" }, workOrders: [], itemPrice: 249 }).reason).toContain("Opportunity");
    expect(canCreateSalesOrder({ row, workOrders: [{ id: 1, customerId: 61142, salesOrderNumber: "SO-1", status: "Completed" }], itemPrice: 249 }).reason).toContain("Existing service order");
    expect(canCreateSalesOrder({ row, workOrders: [], itemPrice: 0 }).reason).toContain("$0");
    expect(canCreateSalesOrder({ row, workOrders: [], itemPrice: 249 }).ok).toBe(true);
  });
});
