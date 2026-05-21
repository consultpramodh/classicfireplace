import { describe, expect, it } from "vitest";
import type { CustomerRecord, IntakeRow } from "../lib/serviceops/types";
import { recommendCustomerMatch, scoreCustomerCandidates } from "../lib/agents/customer-match";

const row: IntakeRow = {
  id: "WEBFORM-10",
  sourceRow: 10,
  submittedAt: "2026-05-05T10:00:00-04:00",
  firstName: "Dana",
  lastName: "Morris",
  phone: "(416) 555-0134",
  altPhone: "",
  email: "dana@example.com",
  street: "44 King St E",
  city: "Toronto",
  province: "ON",
  postalCode: "M5C 1G8",
  country: "Canada",
  preferredDays: "Monday",
  makeModelAge: "Napoleon B36",
  details: "Pilot will not stay lit",
  anythingElse: "",
  pipelineState: "NEW_ROW",
  needsReview: false,
  lastError: "",
  strivenCustomerId: "",
  strivenOppId: "",
  strivenSoId: "",
  salesOrderNumber: "",
  opportunityStage: "",
  taskMatched: false
};

const customers: CustomerRecord[] = [
  { customerId: 1, name: "Dana Morris", email: "dana@example.com", phone: "4165550134", street: "44 King St E", city: "Toronto", postalCode: "M5C1G8" },
  { customerId: 2, name: "Dana M.", email: "other@example.com", phone: "4165550134", street: "1 Other St", city: "Toronto", postalCode: "M5C1G8" }
];

describe("customer match scoring", () => {
  it("scores exact identity signals higher than partial matches", () => {
    const candidates = scoreCustomerCandidates(row, customers);
    expect(candidates[0].customerId).toBe(1);
    expect(candidates[0].confidence).toBe(1);
    expect(candidates[0].matchSignals).toContain("primary phone match");
    expect(candidates[0].matchSignals).toContain("email match");
  });

  it("requires manual review for multiple plausible matches", () => {
    const recommendation = recommendCustomerMatch(row, customers);
    expect(recommendation.status).toBe("needs_review");
    expect(recommendation.skippedActionReason).toContain("Manual approval");
  });

  it("recommends create-new candidate when no match exists but identity is usable", () => {
    const recommendation = recommendCustomerMatch({ ...row, phone: "9055550000", email: "new@example.com", street: "9 New St" }, []);
    expect(recommendation.status).toBe("create_new_candidate");
    expect(recommendation.selectedCustomerId).toBeNull();
  });

  it("preserves an existing Striven customer ID as the safest match", () => {
    const recommendation = recommendCustomerMatch({ ...row, strivenCustomerId: "61142" }, customers);
    expect(recommendation.status).toBe("safe_match");
    expect(recommendation.selectedCustomerId).toBe(61142);
  });
});
