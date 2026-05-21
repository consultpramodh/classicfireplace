/*
 * 010_Striven_ServiceOps_Adapter.ts
 * Isolated Striven operations. Replace TODO endpoints after live verification.
 */

import "server-only";
import { STRIVEN } from "@/lib/config/serviceops-config";
import { buildCustomerPayload, buildCustomerProfileRepairPayload, buildLocationPayload, buildOpportunityPayloadWithContext, buildPreferredDaysPayload, buildSalesOrderPayload } from "@/lib/serviceops/payloads";
import type { IntakeRow } from "@/lib/serviceops/types";
import { buildAddressKey, normalizeEmail, normalizePhone10, parseNumericId, safeText } from "@/lib/serviceops/normalization";
import { strivenClient } from "./client";

export async function createCustomer(row: IntakeRow) {
  return strivenClient.request<Record<string, unknown>>("POST", "/v1/customers", buildCustomerPayload(row));
}

export async function createCustomerWithDetails(row: IntakeRow) {
  const customer = await createCustomer(row);
  const customerId = parseNumericId(customer.Id || customer.id || customer.CustomerId || customer.customerId);
  const warnings: string[] = [];
  const details: Record<string, unknown> = { customer };

  if (!customerId) return { customer, warnings: ["Customer create returned no usable customer ID."] };

  if (safeText(row.street) && safeText(row.city)) {
    try {
      details.location = await createCustomerLocation(customerId, row);
    } catch (error) {
      warnings.push(`Location create failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    warnings.push("Location not created because street/city is missing.");
  }

  return { customer, details, warnings };
}

export async function getCustomer(customerId: number) {
  return strivenClient.request<Record<string, unknown>>("GET", `/v1/customers/${encodeURIComponent(String(customerId))}`);
}

export async function updateCustomerProfileFromWebform(customerId: number, row: IntakeRow) {
  const current = await getCustomer(customerId);
  if (!customerProfileNeedsRepair(current, row)) {
    return { updated: false, customer: current, message: "Customer profile already has the webform phone/email/address." };
  }
  const payload = buildCustomerProfileRepairPayload(current, row, customerId);
  const updated = await strivenClient.request<Record<string, unknown>>("POST", "/v1/customers", payload);
  return { updated: true, customer: updated, message: "Customer profile updated with missing webform details." };
}

export async function createOpportunity(row: IntakeRow, input: { customerId: number; oppTypeId: number; oppCategoryId: number; locationId?: number; contactId?: number }) {
  const created = await strivenClient.request<Record<string, unknown>>("POST", "/v1/opportunities", buildOpportunityPayloadWithContext(row, input));
  const opportunityId = parseNumericId(created.Id || created.id);

  if (opportunityId) {
    const preferredDaysPayload = buildPreferredDaysPayload(row.preferredDays);
    if (preferredDaysPayload.length) {
      await strivenClient.request("POST", `/v1/opportunities/${encodeURIComponent(String(opportunityId))}/custom-fields`, preferredDaysPayload);
    }
  }

  return created;
}

export async function getOpportunity(opportunityId: number) {
  return strivenClient.request<Record<string, unknown>>("GET", `/v1/opportunities/${encodeURIComponent(String(opportunityId))}`);
}

export async function searchCustomerLocations(customerId: number) {
  return strivenClient.request<Record<string, unknown>>("POST", "/v1/customer-locations/search", {
    PageIndex: 0,
    PageSize: 10,
    Customer: { Id: customerId }
  });
}

export async function createCustomerLocation(customerId: number, row: IntakeRow) {
  // TODO: Confirm tenant endpoint. Existing Apps Script currently uses /v1/customers/{id}/location.
  return strivenClient.request<Record<string, unknown>>("POST", `/v1/customers/${encodeURIComponent(String(customerId))}/location`, buildLocationPayload(row));
}

export async function getServiceItemPrice() {
  const item = await strivenClient.request<Record<string, unknown>>("GET", `/v1/items/${STRIVEN.serviceSalesOrder.serviceItemId}`);
  return Number(item.Price || item.price || 0);
}

export async function createSalesOrder(row: IntakeRow, input: { customerId: number; locationId: number; contactId?: number; itemPrice: number }) {
  return strivenClient.request<Record<string, unknown>>("POST", "/v1/sales-orders", buildSalesOrderPayload({ row, ...input }));
}

function customerProfileNeedsRepair(current: Record<string, unknown>, row: IntakeRow) {
  const currentPhones = Array.isArray(current.Phones) ? current.Phones as Record<string, unknown>[] : [];
  const currentPhoneDigits = new Set(currentPhones.map((phone) => normalizePhone10(phone.Number || phone.Phone || phone.PhoneNumber)).filter(Boolean));
  const currentEmail = normalizeEmail(current.Email);
  const currentAddress = typeof current.PrimaryAddress === "object" && current.PrimaryAddress ? current.PrimaryAddress as Record<string, unknown> : {};

  const rowPhone = normalizePhone10(row.phone);
  const rowAltPhone = normalizePhone10(row.altPhone);
  const rowEmail = normalizeEmail(row.email);
  const currentAddressKey = buildAddressKey(currentAddress.Address1, currentAddress.City, currentAddress.PostalCode || currentAddress.Zip);
  const rowAddressKey = buildAddressKey(row.street, row.city, row.postalCode);

  if (rowPhone && !currentPhoneDigits.has(rowPhone)) return true;
  if (rowAltPhone && !currentPhoneDigits.has(rowAltPhone)) return true;
  if (rowEmail && rowEmail !== currentEmail) return true;
  if (safeText(row.street) && safeText(row.city) && currentAddressKey !== rowAddressKey) return true;
  return false;
}
