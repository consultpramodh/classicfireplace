/*
 * 031_Customer_Links.ts
 * Shared route helpers for customer drilldowns.
 */

import type { IntakeRow } from "@/lib/serviceops/types";
import { formatName } from "@/lib/serviceops/normalization";

export function customerDisplayName(row: IntakeRow): string {
  return [formatName(row.firstName), formatName(row.lastName)].filter(Boolean).join(" ").trim() || "Unknown Customer";
}

export function customerDashboardKey(row: IntakeRow): string {
  return row.strivenCustomerId || `row-${row.sourceRow}`;
}

export function customerDashboardHref(row: IntakeRow): string {
  return `/customers/${encodeURIComponent(customerDashboardKey(row))}`;
}
