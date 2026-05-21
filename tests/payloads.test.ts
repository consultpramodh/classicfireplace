import { describe, expect, it } from "vitest";
import { PIPELINE_STATE } from "../lib/config/serviceops-config";
import { buildOpportunityPayloadWithContext, buildSalesOrderPayload } from "../lib/serviceops/payloads";
import type { IntakeRow } from "../lib/serviceops/types";

const row: IntakeRow = {
  id: "TEST-ACCOUNT-1-PIPELINE",
  sourceRow: 1,
  submittedAt: "2026-05-21T09:00:00-04:00",
  firstName: "Account",
  lastName: "One",
  phone: "(416) 555-0001",
  altPhone: "(416) 555-0002",
  email: "account-one@example.com",
  street: "1 Test Account Lane",
  city: "Toronto",
  province: "ON",
  postalCode: "M4L 1G9",
  country: "Canada",
  preferredDays: "No Preference",
  makeModelAge: "Demo fireplace asset",
  details: "Pilot will not light.",
  anythingElse: "Use demo data only.",
  pipelineState: PIPELINE_STATE.customerResolved,
  needsReview: false,
  lastError: "",
  strivenCustomerId: "1",
  strivenOppId: "",
  strivenSoId: "",
  salesOrderNumber: "",
  opportunityStage: "",
  taskMatched: false
};

describe("Striven payload data flow", () => {
  it("passes customer, contact, location, request, and appliance data into opportunity payloads", () => {
    const payload = buildOpportunityPayloadWithContext(row, {
      customerId: 1,
      oppTypeId: 10,
      oppCategoryId: 20,
      locationId: 30,
      contactId: 40
    });

    expect(payload).toMatchObject({
      Customer: { Id: 1 },
      CustomerLocation: { Id: 30 },
      Location: { Id: 30 },
      Contact: { Id: 40 },
      Type: { Id: 10 },
      Categories: [{ Id: 20 }]
    });
    expect(payload.Description).toContain("Primary phone: (416) 555-0001");
    expect(payload.Description).toContain("Email: account-one@example.com");
    expect(payload.Description).toContain("1 Test Account Lane");
    expect(payload.CustomFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ Id: 802, Value: "Demo fireplace asset" }),
      expect.objectContaining({ Id: 804, Value: "Pilot will not light." })
    ]));
  });

  it("passes customer, contact, primary location, notes, and required defaults into sales order payloads", () => {
    const payload = buildSalesOrderPayload({
      row,
      customerId: 1,
      locationId: 30,
      contactId: 40,
      itemPrice: 249
    });

    expect(payload).toMatchObject({
      Customer: { Id: 1 },
      BillToLocation: { Id: 30, Name: "Primary" },
      ShipToLocation: { Id: 30, Name: "Primary" },
      Contact: { Id: 40 },
      Type: { Id: 44938 },
      PaymentTerm: { Id: 13 },
      LineItemsClass: { Id: 14 }
    });
    expect(payload.CustomerNotes.NotesText).toContain("account-one@example.com");
    expect(payload.InternalNotes.NotesText).toContain("Manufacturer and Model: Demo fireplace asset");
    expect(payload.LineItems[0]).toMatchObject({ Item: { Id: 41481 }, Qty: 1, Price: 249 });
  });
});
