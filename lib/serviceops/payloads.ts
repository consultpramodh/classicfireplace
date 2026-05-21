/*
 * 005_ServiceOps_Payloads.ts
 * Server-side Striven payload builders. No client imports.
 */

import { STRIVEN } from "@/lib/config/serviceops-config";
import type { IntakeRow } from "@/lib/serviceops/types";
import { normalizeCountryCode, safeText } from "./normalization";
import { resolvePreferredDayIds } from "./rules";

function htmlEscape(value: unknown): string {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCustomerPayload(row: IntakeRow) {
  const name = [row.firstName, row.lastName].map(safeText).filter(Boolean).join(" ") || row.email || row.phone || "Web Form Customer";
  const phones = buildCustomerPhones(row);
  const primaryAddress = buildLocationAddress(row);

  return {
    Id: 0,
    Name: name,
    FirstName: safeText(row.firstName),
    LastName: safeText(row.lastName),
    Email: safeText(row.email),
    Phone: safeText(row.phone || row.altPhone),
    IsVendor: false,
    IsConsumerAccount: true,
    Type: { Id: STRIVEN.customer.typeCustomerId },
    Status: { Id: STRIVEN.customer.statusActiveId },
    ...(phones.length ? { Phones: phones } : {}),
    PrimaryAddress: primaryAddress,
    Address: {
      Address1: safeText(row.street),
      City: safeText(row.city),
      State: safeText(row.province) || "ON",
      Zip: safeText(row.postalCode),
      Country: normalizeCountryCode(row.country || "Canada")
    }
  };
}

export function buildOpportunityTitle(row: IntakeRow): string {
  const fullName = [row.firstName, row.lastName].map(safeText).filter(Boolean).join(" ") || "Unknown Customer";
  return ["Webform: " + fullName, safeText(row.city), safeText(row.phone)].filter(Boolean).join(" - ");
}

export function buildOpportunityDescription(row: IntakeRow): string {
  const address = [row.street, row.city, row.province, row.postalCode, row.country].map(safeText).filter(Boolean).join(", ") || "-";
  const name = [row.firstName, row.lastName].map(safeText).filter(Boolean).join(" ") || "-";
  const primaryContact = [
    row.phone ? `Primary phone: ${row.phone}` : "",
    row.altPhone ? `Alt phone: ${row.altPhone}` : "",
    row.email ? `Email: ${row.email}` : ""
  ].filter(Boolean).join(" | ") || "-";
  const rows = [
    ["Customer Name", name],
    ["Primary Contact", primaryContact],
    ["Phone", row.phone],
    ["Alt Phone", row.altPhone],
    ["Email", row.email],
    ["Address", address],
    ["Preferred Days", row.preferredDays],
    ["Make/Model/Age", row.makeModelAge],
    ["Details", row.details],
    ["Anything Else", row.anythingElse]
  ];

  return [
    '<div style="max-width:700px;width:100%;font-family:Arial,sans-serif;font-size:13px;">',
    '<p style="margin:0 0 10px 0;"><strong>Source:</strong> Web Form</p>',
    '<table cellspacing="0" cellpadding="0" style="width:100%;max-width:700px;table-layout:fixed;border-collapse:collapse;overflow-wrap:break-word;">',
    "<tbody>",
    ...rows.map(([label, value]) => {
      return `<tr><td style="border:1px solid #ddd;padding:8px;font-weight:bold;background:#f7f7f7;width:32%;vertical-align:top;">${htmlEscape(label)}</td><td style="border:1px solid #ddd;padding:8px;width:68%;vertical-align:top;">${htmlEscape(value || "-")}</td></tr>`;
    }),
    "</tbody></table></div>"
  ].join("");
}

export function buildOpportunityPayload(row: IntakeRow, customerId: number, oppTypeId: number, oppCategoryId: number) {
  return buildOpportunityPayloadWithContext(row, { customerId, oppTypeId, oppCategoryId });
}

export function buildOpportunityPayloadWithContext(row: IntakeRow, input: {
  customerId: number;
  oppTypeId: number;
  oppCategoryId: number;
  locationId?: number;
  contactId?: number;
}) {
  const customFields = [
    row.makeModelAge ? { Id: STRIVEN.opportunityCustomFields.makeModelAge, Value: row.makeModelAge, ValueText: row.makeModelAge } : null,
    row.details ? { Id: STRIVEN.opportunityCustomFields.details, Value: row.details, ValueText: row.details } : null,
    row.anythingElse ? { Id: STRIVEN.opportunityCustomFields.anythingElse, Value: row.anythingElse, ValueText: row.anythingElse } : null
  ].filter(Boolean);

  return {
    Title: buildOpportunityTitle(row),
    Type: { Id: input.oppTypeId },
    Customer: { Id: input.customerId },
    Description: buildOpportunityDescription(row),
    Categories: [{ Id: input.oppCategoryId }],
    ...(input.locationId ? {
      CustomerLocation: { Id: input.locationId },
      Location: { Id: input.locationId }
    } : {}),
    ...(input.contactId ? { Contact: { Id: input.contactId } } : {}),
    ...(customFields.length ? { CustomFields: customFields } : {})
  };
}

export function buildPreferredDaysPayload(preferredDays: string) {
  return resolvePreferredDayIds(preferredDays).map((id) => ({
    Id: STRIVEN.opportunityCustomFields.preferredDay,
    Value: String(id),
    ValueText: Object.entries(STRIVEN.preferredDaysMap).find(([, value]) => value === id)?.[0] || ""
  }));
}

export function buildLocationPayload(row: IntakeRow) {
  const fullAddress = [row.street, row.city, row.province || "ON", row.postalCode, row.country || "Canada"].map(safeText).filter(Boolean).join(", ");
  return {
    Id: 0,
    Name: "Primary",
    IsPrimary: true,
    Address: {
      Address1: safeText(row.street),
      Address2: "",
      Address3: "",
      City: safeText(row.city),
      State: safeText(row.province) || "ON",
      PostalCode: safeText(row.postalCode),
      Country: normalizeCountryCode(row.country || "Canada"),
      FullAddress: fullAddress
    }
  };
}

function buildLocationAddress(row: IntakeRow) {
  return {
    Address1: safeText(row.street),
    Address2: "",
    Address3: "",
    City: safeText(row.city),
    State: safeText(row.province) || "ON",
    PostalCode: safeText(row.postalCode),
    Zip: safeText(row.postalCode),
    Country: normalizeCountryCode(row.country || "Canada")
  };
}

export function buildCustomerProfileRepairPayload(current: Record<string, unknown>, row: IntakeRow, customerId: number) {
  const currentPhones = Array.isArray(current.Phones) ? current.Phones as Record<string, unknown>[] : [];
  const mergedPhones = mergePhones(currentPhones, buildCustomerPhones(row));
  const primaryAddress = {
    ...(typeof current.PrimaryAddress === "object" && current.PrimaryAddress ? current.PrimaryAddress as Record<string, unknown> : {}),
    ...buildLocationAddress(row)
  };

  return {
    ...current,
    Id: customerId,
    Name: safeText(current.Name) || [row.firstName, row.lastName].map(safeText).filter(Boolean).join(" ") || row.email || row.phone || "Web Form Customer",
    Email: safeText(current.Email) || safeText(row.email),
    Phone: safeText(current.Phone) || safeText(row.phone || row.altPhone),
    ...(mergedPhones.length ? { Phones: mergedPhones } : {}),
    PrimaryAddress: primaryAddress
  };
}

function buildCustomerPhones(row: IntakeRow) {
  const phones = [];
  const primary = safeText(row.phone);
  const alternate = safeText(row.altPhone);

  if (primary) {
    phones.push({
      Id: 0,
      PhoneType: { Id: 0, Name: "Primary" },
      CountryDialCode: 1,
      Number: primary,
      Extension: "",
      IsPreferred: true,
      Active: true
    });
  }

  if (alternate && alternate !== primary) {
    phones.push({
      Id: 0,
      PhoneType: { Id: 0, Name: "Alternate" },
      CountryDialCode: 1,
      Number: alternate,
      Extension: "",
      IsPreferred: false,
      Active: true
    });
  }

  return phones;
}

function mergePhones(currentPhones: Record<string, unknown>[], incomingPhones: Record<string, unknown>[]) {
  const normalized = new Set(currentPhones.map((phone) => safeText(phone.Number || phone.Phone || phone.PhoneNumber).replace(/\D/g, "")));
  const missing = incomingPhones.filter((phone) => {
    const digits = safeText(phone.Number).replace(/\D/g, "");
    return digits && !normalized.has(digits);
  });
  return [...currentPhones, ...missing];
}

export function buildSalesOrderPayload(input: {
  row: IntakeRow;
  customerId: number;
  locationId: number;
  contactId?: number;
  itemPrice: number;
}) {
  const cf = STRIVEN.serviceSalesOrder.customFields;
  const notes = [
    input.row.firstName || input.row.lastName ? `Customer: ${[input.row.firstName, input.row.lastName].filter(Boolean).join(" ")}` : "",
    input.row.email ? `Email: ${input.row.email}` : "",
    input.row.phone ? `Phone: ${input.row.phone}` : "",
    input.row.preferredDays ? `Preferred Days: ${input.row.preferredDays}` : "",
    input.row.makeModelAge ? `Manufacturer and Model: ${input.row.makeModelAge}` : "",
    "",
    "Details:",
    input.row.details,
    input.row.anythingElse ? `\nAnything Else:\n${input.row.anythingElse}` : ""
  ].filter((value) => value !== "").join("\n");

  return {
    Id: 0,
    Type: { Id: STRIVEN.serviceSalesOrder.orderTypeId },
    Status: { Id: STRIVEN.serviceSalesOrder.statusQuotedId },
    Customer: { Id: input.customerId },
    BillToLocation: { Id: input.locationId, Name: "Primary" },
    ShipToLocation: { Id: input.locationId, Name: "Primary" },
    SalesRep: { Id: STRIVEN.serviceSalesOrder.salesRepId },
    PaymentTerm: { Id: STRIVEN.serviceSalesOrder.paymentTermId },
    LineItemsClass: { Id: STRIVEN.serviceSalesOrder.lineItemClassId },
    OrderName: "Clean and Service",
    OrderDate: new Date().toISOString(),
    CustomerNotes: { NotesText: notes, NotesHtml: htmlEscape(notes).replace(/\n/g, "<br>") },
    InternalNotes: { NotesText: notes },
    LineItems: [{
      Id: 0,
      Item: { Id: STRIVEN.serviceSalesOrder.serviceItemId },
      Description: "Clean and Service",
      Qty: 1,
      Price: Number(input.itemPrice || 0),
      Taxable: true,
      Class: { Id: STRIVEN.serviceSalesOrder.lineItemClassId }
    }],
    CustomFields: [
      { Id: cf.scheduled, Value: "False" },
      { Id: cf.serviceTech, Value: String(STRIVEN.serviceSalesOrder.defaultServiceTechId) },
      { Id: cf.manufacturerModel, Value: input.row.makeModelAge }
    ],
    ...(input.contactId ? { Contact: { Id: input.contactId } } : {})
  };
}
