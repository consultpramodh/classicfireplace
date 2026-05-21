/*
 * 030_Striven_Reports.ts
 * Read-only report sync adapter for Striven v2 reports.
 */

import "server-only";
import { getEnv } from "@/lib/config/serviceops-config";
import type { CustomerLocation, CustomerRecord, WorkOrderRecord } from "@/lib/serviceops/types";
import { findValueByAliases, parseNumericId, safeText } from "@/lib/serviceops/normalization";
import { LOOKUP_ALIASES } from "@/lib/config/serviceops-config";
import { strivenClient } from "./client";

export type ReportKey = "customers" | "customerLocations" | "serviceWorkOrders" | "serviceTasks" | "opportunities" | "customerAssets" | "invoiceAssetsSerials" | "installationTasks";

function reportUrlFor(key: ReportKey): string {
  const env = getEnv();
  const map: Record<ReportKey, string> = {
    customers: env.reportCustomers,
    customerLocations: env.reportCustomerLocations,
    serviceWorkOrders: env.reportServiceWorkOrders,
    serviceTasks: env.reportServiceTasks,
    opportunities: env.reportOpportunities,
    customerAssets: env.reportCustomerAssets,
    invoiceAssetsSerials: env.reportInvoiceAssetsSerials,
    installationTasks: env.reportInstallationTasks
  };
  return map[key] || "";
}

export async function fetchReportRows(key: ReportKey, pageSize = 1000, maxPages = 200): Promise<Record<string, unknown>[]> {
  const reportUrl = reportUrlFor(key);
  if (!reportUrl) throw new Error(`Missing report URL for ${key}.`);

  const out: Record<string, unknown>[] = [];
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const url = buildPagedUrl(reportUrl, pageIndex, pageSize);
    const json = await strivenClient.request<unknown>("GET", url);
    const rows = normalizeRows(json);
    if (!rows.length) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function fetchCustomersReport(): Promise<CustomerRecord[]> {
  const rows = await fetchReportRows("customers");
  return normalizeCustomerReportRows(rows);
}

export function normalizeCustomerReportRows(rows: Record<string, unknown>[]): CustomerRecord[] {
  return rows.map((row) => ({
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
  })).filter((row) => row.customerId);
}

export async function fetchCustomerLocationsReport(): Promise<CustomerLocation[]> {
  const rows = await fetchReportRows("customerLocations");
  return normalizeCustomerLocationReportRows(rows);
}

export function normalizeCustomerLocationReportRows(rows: Record<string, unknown>[]): CustomerLocation[] {
  return rows.map((row) => ({
    id: parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.customerLocationId)),
    customerId: parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    name: safeText(findValueByAliases(row, ["LocationName", "Location Name", "Name"])),
    street: safeText(findValueByAliases(row, LOOKUP_ALIASES.street)),
    city: safeText(findValueByAliases(row, LOOKUP_ALIASES.city)),
    province: safeText(findValueByAliases(row, LOOKUP_ALIASES.province)),
    postalCode: safeText(findValueByAliases(row, LOOKUP_ALIASES.postalCode))
  })).filter((row) => row.id && row.customerId);
}

export async function fetchServiceWorkOrdersReport(): Promise<WorkOrderRecord[]> {
  const rows = await fetchReportRows("serviceWorkOrders");
  return normalizeServiceWorkOrderReportRows(rows);
}

export function normalizeServiceWorkOrderReportRows(rows: Record<string, unknown>[]): WorkOrderRecord[] {
  return rows.map((row) => ({
    id: parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.salesOrderId)) || parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.workOrderId)),
    customerId: parseNumericId(findValueByAliases(row, LOOKUP_ALIASES.customerId)),
    salesOrderNumber: safeText(findValueByAliases(row, LOOKUP_ALIASES.salesOrderNumber)),
    status: safeText(findValueByAliases(row, ["Status", "SOStatus", "SO Status", "SalesOrderStatus", "OrderStatus"])),
    createdAt: safeText(findValueByAliases(row, ["CreatedOn", "Created On", "CreatedDate", "OrderDate"]))
  })).filter((row) => row.id || row.salesOrderNumber);
}

function buildPagedUrl(baseUrl: string, pageIndex: number, pageSize: number) {
  const sep = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${sep}PageIndex=${encodeURIComponent(String(pageIndex))}&PageSize=${encodeURIComponent(String(pageSize))}`;
}

export function normalizeRows(data: unknown): Record<string, unknown>[] {
  if (!data) return [];
  const obj = data as Record<string, unknown>;
  const candidates = [obj.Results, obj.Result, obj.Data, obj.data, obj.Rows, obj.rows, obj.Items, obj.items, data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row));
    }
  }
  return [];
}
