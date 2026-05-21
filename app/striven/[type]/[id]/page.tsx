/*
 * 043_Striven_Record_Page.tsx
 * Reliable local Striven record viewer. Uses the API instead of fragile web deep links.
 */

import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { getEnv } from "@/lib/config/serviceops-config";
import { parseNumericId, safeText } from "@/lib/serviceops/normalization";
import { strivenClient } from "@/lib/striven/client";
import type { StrivenRecordType } from "@/lib/striven/links";

export const dynamic = "force-dynamic";

type PageParams = {
  type: StrivenRecordType;
  id: string;
};

export default async function StrivenRecordPage({ params }: { params: Promise<PageParams> }) {
  const { type, id } = await params;
  const numericId = parseNumericId(id);
  const recordType = normalizeType(type);

  let record: Record<string, unknown> | null = null;
  let error = "";

  if (!numericId || !recordType) {
    error = "Missing or invalid Striven record ID.";
  } else {
    try {
      record = await fetchStrivenRecord(recordType, numericId);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  const title = record && recordType ? buildTitle(recordType, record, numericId) : "Striven Record";
  const status = record ? extractStatus(record) : "";
  const tenantUrl = getEnv().strivenWebBaseUrl;

  return (
    <AppFrame>
      <PageHeader
        title={title}
        description={recordType ? `${labelForType(recordType)} ${numericId}` : "Striven lookup"}
        actions={
          <div className="toolbar">
            <Link className="btn" href="/intake"><ArrowLeft size={16} /> Intake</Link>
            <a className="btn" href={tenantUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open Striven</a>
          </div>
        }
      />

      {error ? (
        <section className="panel error" style={{ marginBottom: 16 }}>{error}</section>
      ) : null}

      {record ? (
        <section className="customer-grid">
          <section className="panel">
            <div className="panel-header">
              <h3>Summary</h3>
              {status ? <StatusBadge value={status} /> : null}
            </div>
            <div className="settings-list">
            {summaryRows(recordType, record, numericId).map(([label, value]) => (
                <div className="kv" key={label}>
                  <span>{label}</span>
                  <strong>{value || "-"}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><h3>Search In Striven</h3><span className="badge info">No 404</span></div>
            <div className="live-note">
              <strong>Use these values in Striven search</strong>
              <p>
                Striven’s browser URL pattern is tenant-specific and the guessed deep links returned 404.
                This page is using the API, so the record data is correct. Open Striven and search the ID or number below.
              </p>
              <div className="settings-list">
                {searchTokens(recordType, record, numericId).map((token) => (
                  <div className="kv" key={token}>
                    <span>Search</span>
                    <strong>{token}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel raw-record-panel">
            <div className="panel-header"><h3>Record Data</h3><span className="badge">API</span></div>
            <pre className="raw-record">{JSON.stringify(record, null, 2)}</pre>
          </section>
        </section>
      ) : null}
    </AppFrame>
  );
}

function normalizeType(type: string): StrivenRecordType {
  if (type === "customer" || type === "opportunity" || type === "salesOrder") return type;
  return "customer";
}

async function fetchStrivenRecord(type: StrivenRecordType, id: number) {
  const path =
    type === "customer" ? `/v1/customers/${encodeURIComponent(String(id))}` :
    type === "opportunity" ? `/v1/opportunities/${encodeURIComponent(String(id))}` :
    `/v1/sales-orders/${encodeURIComponent(String(id))}`;

  return strivenClient.request<Record<string, unknown>>("GET", path);
}

function labelForType(type: StrivenRecordType) {
  return type === "customer" ? "Customer" : type === "opportunity" ? "Opportunity" : "Sales Order";
}

function buildTitle(type: StrivenRecordType, record: Record<string, unknown>, id: number) {
  if (type === "salesOrder") return `Sales Order ${safeText(record.orderNumber || record.OrderNumber) || id}`;
  if (type === "opportunity") return safeText(record.title || record.Title) || `Opportunity ${id}`;
  return safeText(record.name || record.Name) || `Customer ${id}`;
}

function extractStatus(record: Record<string, unknown>) {
  const status = record.status as { name?: unknown } | undefined;
  const stage = record.stage as { name?: unknown } | undefined;
  return safeText(status?.name || stage?.name || record.Status || record.status);
}

function summaryRows(type: StrivenRecordType, record: Record<string, unknown>, id: number): [string, string][] {
  if (type === "salesOrder") {
    const customer = record.customer as { id?: unknown; number?: unknown; name?: unknown } | undefined;
    return [
      ["Sales Order ID", String(id)],
      ["Order Number", safeText(record.orderNumber || record.OrderNumber)],
      ["Status", extractStatus(record)],
      ["Customer", [safeText(customer?.number), safeText(customer?.name)].filter(Boolean).join(" - ")],
      ["Order Date", safeText(record.orderDate || record.OrderDate)],
      ["Order Name", safeText(record.orderName || record.OrderName)],
      ["Total", safeText(record.orderTotal || record.OrderTotal)]
    ];
  }

  if (type === "opportunity") {
    const customer = record.customer as { id?: unknown; name?: unknown } | undefined;
    return [
      ["Opportunity ID", String(id)],
      ["Title", safeText(record.title || record.Title)],
      ["Stage", extractStatus(record)],
      ["Customer", [safeText(customer?.id), safeText(customer?.name)].filter(Boolean).join(" - ")],
      ["Expected Close", safeText(record.expectedCloseDate || record.ExpectedCloseDate)]
    ];
  }

  const primaryContact = record.primaryContact as { id?: unknown; name?: unknown } | undefined;
  return [
    ["Customer ID", String(id)],
    ["Customer Number", safeText(record.number || record.Number)],
    ["Name", safeText(record.name || record.Name)],
    ["Status", extractStatus(record)],
    ["Primary Contact", [safeText(primaryContact?.id), safeText(primaryContact?.name)].filter(Boolean).join(" - ")]
  ];
}

function searchTokens(type: StrivenRecordType, record: Record<string, unknown>, id: number) {
  const tokens = new Set<string>([String(id)]);
  if (type === "salesOrder") {
    tokens.add(safeText(record.orderNumber || record.OrderNumber));
  }
  if (type === "customer") {
    tokens.add(safeText(record.number || record.Number));
    tokens.add(safeText(record.name || record.Name));
  }
  if (type === "opportunity") {
    tokens.add(safeText(record.title || record.Title));
  }
  return Array.from(tokens).filter(Boolean);
}
