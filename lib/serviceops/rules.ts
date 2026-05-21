/*
 * 004_ServiceOps_Rules.ts
 * Pure business rules: matching, preferred days, duplicate guardrails, stage gating.
 */

import { LOOKUP_ALIASES, OPPORTUNITY_STAGES, STRIVEN } from "@/lib/config/serviceops-config";
import type { CustomerRecord, IntakeRow, WorkOrderRecord } from "@/lib/serviceops/types";
import { buildAddressKey, findValueByAliases, normalizeEmail, normalizePhone10, parseNumericId, safeText } from "./normalization";

export function hasUsableIdentity(row: Pick<IntakeRow, "email" | "phone" | "altPhone" | "street" | "city">): boolean {
  return !!(normalizeEmail(row.email) || normalizePhone10(row.phone) || normalizePhone10(row.altPhone) || (safeText(row.street) && safeText(row.city)));
}

export function matchCustomer(row: IntakeRow, customers: CustomerRecord[]) {
  const email = normalizeEmail(row.email);
  const phone = normalizePhone10(row.phone);
  const altPhone = normalizePhone10(row.altPhone);
  const addressPostalKey = buildAddressKey(row.street, row.city, row.postalCode);
  const addressKey = buildAddressKey(row.street, row.city);

  const normalized = customers.map((customer) => ({
    customer,
    email: normalizeEmail(customer.email),
    phone: normalizePhone10(customer.phone),
    altPhone: normalizePhone10(customer.altPhone),
    addressPostalKey: buildAddressKey(customer.street, customer.city, customer.postalCode),
    addressKey: buildAddressKey(customer.street, customer.city)
  }));

  const byEmail = email ? normalized.find((item) => item.email === email) : undefined;
  if (byEmail) return { customerId: byEmail.customer.customerId, reason: "email" };

  const byPhone = phone ? normalized.find((item) => item.phone === phone || item.altPhone === phone) : undefined;
  if (byPhone) return { customerId: byPhone.customer.customerId, reason: "phone" };

  const byAlt = altPhone ? normalized.find((item) => item.phone === altPhone || item.altPhone === altPhone) : undefined;
  if (byAlt) return { customerId: byAlt.customer.customerId, reason: "alt-phone" };

  const byAddressPostal = addressPostalKey !== "||" ? normalized.find((item) => item.addressPostalKey === addressPostalKey) : undefined;
  if (byAddressPostal) return { customerId: byAddressPostal.customer.customerId, reason: "address-postal" };

  const byAddress = addressKey !== "|" ? normalized.find((item) => item.addressKey === addressKey) : undefined;
  if (byAddress) return { customerId: byAddress.customer.customerId, reason: "address" };

  return { customerId: 0, reason: "" };
}

export function resolvePreferredDayIds(raw: string): number[] {
  const parts = safeText(raw)
    .split(/[,;|]+/)
    .map((part) => safeText(part))
    .filter(Boolean);

  return parts
    .map((part) => resolvePreferredDayId(part))
    .filter((id): id is number => !!id);
}

export function resolvePreferredDayId(raw: string): number {
  const exact = STRIVEN.preferredDaysMap[raw as keyof typeof STRIVEN.preferredDaysMap];
  if (exact) return exact;

  const normalized = raw.toLowerCase();
  const found = Object.entries(STRIVEN.preferredDaysMap).find(([label]) => label.toLowerCase() === normalized);
  return found ? found[1] : 0;
}

export function shouldCreateSalesOrderFromStage(stage: string): boolean {
  return safeText(stage).toLowerCase() === OPPORTUNITY_STAGES.approvedForSwo.toLowerCase();
}

export function canCreateSalesOrder(input: {
  row: IntakeRow;
  workOrders: WorkOrderRecord[];
  itemPrice: number;
}) {
  const existingSoId = parseNumericId(input.row.strivenSoId);
  if (existingSoId) return { ok: false, reason: "Sales Order already exists." };

  if (!parseNumericId(input.row.strivenCustomerId)) {
    return { ok: false, reason: "Missing Striven Customer ID." };
  }

  if (!parseNumericId(input.row.strivenOppId)) {
    return { ok: false, reason: "Missing Striven Opportunity ID." };
  }

  if (!shouldCreateSalesOrderFromStage(input.row.opportunityStage)) {
    return { ok: false, reason: "Opportunity stage is not Approved for SWO." };
  }

  if (!safeText(input.row.makeModelAge)) {
    return { ok: false, reason: "Missing required field: Make/Model/Age." };
  }

  const customerId = parseNumericId(input.row.strivenCustomerId);
  const blocked = new Set<string>(STRIVEN.serviceSalesOrder.blockStatuses);
  const duplicate = input.workOrders.find((order) => order.customerId === customerId && blocked.has(order.status.toLowerCase()));
  if (duplicate) {
    return { ok: false, reason: `Existing service order ${duplicate.salesOrderNumber || duplicate.id} is already ${duplicate.status}.` };
  }

  if (!(input.itemPrice > 0)) {
    return { ok: false, reason: `Striven item ${STRIVEN.serviceSalesOrder.serviceItemId} price is $0.` };
  }

  return { ok: true, reason: "" };
}

export function extractReportCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    customerId: parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    customerNumber: safeText(findValueByAliases(row, ["CustomerNumber", "Customer Number"])),
    name: safeText(findValueByAliases(row, LOOKUP_ALIASES.customerName)),
    email: safeText(findValueByAliases(row, LOOKUP_ALIASES.email)),
    phone: safeText(findValueByAliases(row, LOOKUP_ALIASES.phone)),
    altPhone: safeText(findValueByAliases(row, LOOKUP_ALIASES.altPhone)),
    street: safeText(findValueByAliases(row, LOOKUP_ALIASES.street)),
    city: safeText(findValueByAliases(row, LOOKUP_ALIASES.city)),
    postalCode: safeText(findValueByAliases(row, LOOKUP_ALIASES.postalCode)),
    contactId: parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.contactId))
  };
}
