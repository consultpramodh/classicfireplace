/*
 * 035_Striven_Links.ts
 * Browser navigation URLs for Striven records. Templates are centralized
 * because tenant route patterns can differ.
 */

import "server-only";
import { getEnv } from "@/lib/config/serviceops-config";
import { parseNumericId } from "@/lib/serviceops/normalization";

export type StrivenRecordType = "customer" | "opportunity" | "salesOrder" | "task" | "asset" | "invoice";

export function buildStrivenRecordUrl(type: StrivenRecordType, id: unknown): string {
  const numericId = parseNumericId(id);
  const recordId = type === "invoice" ? String(id || "").trim() : String(numericId || "");
  if (!recordId) return "";

  const env = getEnv();
  const template =
    type === "customer" ? env.strivenCustomerUrlTemplate :
    type === "opportunity" ? env.strivenOpportunityUrlTemplate :
    type === "task" ? "/Tasks/TaskInfo.aspx?nav=1&TaskID={id}" :
    type === "asset" ? "/AssetManagement/CustomerAssetsBasicInfo.aspx?AssetID={id}" :
    type === "invoice" ? "/Accounting/InvoiceInfo.aspx?InvoiceID={id}" :
    env.strivenSalesOrderUrlTemplate;

  return expandStrivenTemplate(env.strivenWebBaseUrl, template, recordId);
}

function expandStrivenTemplate(baseUrl: string, template: string, id: string) {
  const expanded = String(template || "").replace(/\{id\}/g, encodeURIComponent(id));
  if (/^https?:\/\//i.test(expanded)) return expanded;

  const cleanBase = String(baseUrl || "https://classicfireplace.striven.com").replace(/\/+$/, "");
  const cleanPath = expanded.startsWith("/") ? expanded : `/${expanded}`;
  return `${cleanBase}${cleanPath}`;
}
