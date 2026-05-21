/*
 * 036_ServiceOps_Analytics.ts
 * Quantity/report aggregation for the Analytics page. Reads local snapshots only.
 */

import "server-only";
import { LOOKUP_ALIASES } from "@/lib/config/serviceops-config";
import { findValueByAliases, safeText } from "@/lib/serviceops/normalization";
import { getCachedReportRows } from "@/lib/serviceops/snapshots";
import type { IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";

export type QuantityRow = {
  label: string;
  count: number;
  href?: string;
  tone?: "ok" | "warn" | "danger" | "info";
};

export function buildAnalytics(rows: IntakeRow[], taskRows: TaskMappingRow[]) {
  const reports = {
    customers: getCachedReportRows("customers"),
    customerLocations: getCachedReportRows("customerLocations"),
    serviceWorkOrders: getCachedReportRows("serviceWorkOrders"),
    serviceTasks: getCachedReportRows("serviceTasks"),
    customerAssets: getCachedReportRows("customerAssets"),
    opportunities: getCachedReportRows("opportunities")
  };

  const total = rows.length;
  const customerResolved = rows.filter((row) => !!row.strivenCustomerId).length;
  const opportunitiesCreated = rows.filter((row) => !!row.strivenOppId).length;
  const salesOrdersCreated = rows.filter((row) => !!row.strivenSoId).length;
  const needsReview = rows.filter((row) => row.needsReview || row.lastError).length;
  const errors = rows.filter((row) => row.pipelineState === "ERROR" || row.lastError).length;
  const stuckAfterCustomer = rows.filter((row) => row.strivenCustomerId && !row.strivenOppId).length;
  const stuckAfterOpportunity = rows.filter((row) => row.strivenOppId && !row.strivenSoId).length;

  const pipeline = countBy(rows, (row) => row.pipelineState || "Unknown");
  const cities = countBy(rows, (row) => row.city || "Unknown").slice(0, 8);
  const preferredDays = countBy(rows, (row) => row.preferredDays || "Not provided").slice(0, 8);
  const monthly = countByMonth(rows).slice(-12);

  const workOrderStatus = countReportBy(reports.serviceWorkOrders.rows, ["Status", "SOStatus", "SO Status", "SalesOrderStatus", "OrderStatus"]).slice(0, 8);
  const taskStatus = countReportBy(reports.serviceTasks.rows, ["Status", "TaskStatus", "Task Status"]).slice(0, 8);
  const opportunityStatus = countReportBy(reports.opportunities.rows, ["Status", "OpportunityStatus", "Opportunity Status"]).slice(0, 8);
  const manufacturers = countReportBy(reports.customerAssets.rows, LOOKUP_ALIASES.manufacturerName).slice(0, 8);
  const taskMappingStatus = countBy(taskRows, (row) => row.rowStatus || "Unknown");

  const topMetrics: QuantityRow[] = [
    { label: "Intake Rows", count: total, href: "/intake", tone: "info" },
    { label: "Customers Resolved", count: customerResolved, href: "/customer-resolution", tone: "ok" },
    { label: "Opportunities", count: opportunitiesCreated, href: "/opportunities", tone: "ok" },
    { label: "Sales Orders", count: salesOrdersCreated, href: "/sales-orders", tone: "ok" },
    { label: "Needs Review", count: needsReview, href: "/review-queue", tone: needsReview ? "warn" : "ok" },
    { label: "Errors / Blocks", count: errors, href: "/review-queue", tone: errors ? "danger" : "ok" }
  ];

  const reportInventory: QuantityRow[] = [
    { label: "Striven Customers", count: reports.customers.rows.length },
    { label: "Customer Locations", count: reports.customerLocations.rows.length },
    { label: "Service Work Orders", count: reports.serviceWorkOrders.rows.length },
    { label: "Service Tasks", count: reports.serviceTasks.rows.length },
    { label: "Customer Assets", count: reports.customerAssets.rows.length },
    { label: "Opportunities Report", count: reports.opportunities.rows.length }
  ];

  const efficiency: QuantityRow[] = [
    { label: "Need customer resolution", count: rows.filter((row) => !row.strivenCustomerId).length, href: "/customer-resolution", tone: "warn" },
    { label: "Have customer, need opportunity", count: stuckAfterCustomer, href: "/opportunities", tone: stuckAfterCustomer ? "warn" : "ok" },
    { label: "Have opportunity, need SO", count: stuckAfterOpportunity, href: "/sales-orders", tone: stuckAfterOpportunity ? "warn" : "ok" },
    { label: "Task rows out of sync", count: taskRows.filter((row) => row.rowStatus !== "In Sync").length, href: "/tasks-calendar", tone: "warn" }
  ];

  return {
    reports,
    topMetrics,
    reportInventory,
    efficiency,
    pipeline,
    cities,
    preferredDays,
    monthly,
    workOrderStatus,
    taskStatus,
    opportunityStatus,
    manufacturers,
    taskMappingStatus,
    rates: {
      customerResolve: percent(customerResolved, total),
      opportunityCreate: percent(opportunitiesCreated, total),
      salesOrderCreate: percent(salesOrdersCreated, total),
      reviewLoad: percent(needsReview, total)
    }
  };
}

export function countBy<T>(items: T[], getLabel: (item: T) => string): QuantityRow[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const label = safeText(getLabel(item)) || "Unknown";
    map.set(label, (map.get(label) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function countReportBy(rows: Record<string, unknown>[], aliases: readonly string[]) {
  return countBy(rows, (row) => safeText(findValueByAliases(row, aliases)) || "Unknown");
}

function countByMonth(rows: IntakeRow[]): QuantityRow[] {
  const map = new Map<string, { label: string; count: number }>();
  for (const row of rows) {
    const date = parseDate(row.submittedAt);
    const sortKey = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "9999-99";
    const label = date
      ? date.toLocaleString("en-US", { month: "short", year: "numeric" })
      : "Unknown";
    const current = map.get(sortKey) || { label, count: 0 };
    map.set(sortKey, { label, count: current.count + 1 });
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function parseDate(value: unknown) {
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
