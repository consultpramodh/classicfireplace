/*
 * 036_Striven_Record_Link.tsx
 * External record link. Renders nothing if an ID is missing.
 */

import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { parseNumericId } from "@/lib/serviceops/normalization";

export type StrivenRecordType = "customer" | "opportunity" | "salesOrder" | "task" | "asset" | "invoice";

export function StrivenRecordLink({
  type,
  id,
  accountId,
  label = "Open in Striven",
  compact = false,
  children
}: {
  type: StrivenRecordType;
  id: unknown;
  accountId?: unknown;
  label?: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const recordId = type === "invoice" ? String(id || "").trim() : String(parseNumericId(id) || "");
  if (!recordId) return null;
  const href = buildDirectStrivenUrl(type, recordId, accountId);

  return (
    <a
      className={compact ? children ? "striven-link compact text" : "striven-link compact" : "striven-link"}
      href={href}
      target="_blank"
      rel="noreferrer"
      title={label}
    >
      {children || <ExternalLink size={compact ? 13 : 15} />}
      {children ? null : compact ? <span className="sr-only">{label}</span> : label}
    </a>
  );
}

function buildDirectStrivenUrl(type: StrivenRecordType, id: string, accountId?: unknown) {
  const base = "https://classicfireplace.striven.com";
  const encoded = encodeURIComponent(id);
  if (type === "customer") return `${base}/CRM/AccountDashboard.aspx?AccountID=${encoded}`;
  if (type === "opportunity") {
    const accountRecordId = String(parseNumericId(accountId) || "").trim();
    return accountRecordId
      ? `${base}/CRM/Opportunities/OpportunityList.aspx?nav=1&AccountId=${encodeURIComponent(accountRecordId)}`
      : `${base}/Sales/OpportunityInfo.aspx?OpportunityID=${encoded}`;
  }
  if (type === "salesOrder") return `${base}/next/crm#/sales-orders/${encoded}`;
  if (type === "task") return `${base}/Tasks/TaskInfo.aspx?nav=1&TaskID=${encoded}`;
  if (type === "invoice") return `${base}/Accounting/InvoiceInfo.aspx?InvoiceID=${encoded}`;
  return `${base}/AssetManagement/CustomerAssetsBasicInfo.aspx?AssetID=${encoded}`;
}
