"use client";

import { useMemo, useState } from "react";
import type { AuditLogEntry, IntakeRow } from "@/lib/serviceops/types";
import { formatEmail, formatName, formatPhone } from "@/lib/serviceops/normalization";
import { StrivenRecordLink, type StrivenRecordType } from "@/components/striven-record-link";

type CustomerLogRow = {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  sourceRow: string;
  requestId: string;
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  opportunityId: string;
  salesOrderId: string;
  taskId: string;
  result: string;
  details: string;
  preview: string;
};

type ExportKind = "csv" | "excel" | "pdf";

export function CustomerLogsTable({ auditRows, intakeRows }: { auditRows: AuditLogEntry[]; intakeRows: IntakeRow[] }) {
  const [query, setQuery] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const rows = useMemo(() => buildCustomerLogs(auditRows, intakeRows), [auditRows, intakeRows]);
  const customers = useMemo(() => uniqueOptions(rows.map((row) => row.customerId || row.customerName).filter(Boolean)), [rows]);
  const actions = useMemo(() => uniqueOptions(rows.map((row) => row.action).filter(Boolean)), [rows]);
  const filteredRows = useMemo(() => filterLogRows(rows, query, customerFilter, actionFilter), [rows, query, customerFilter, actionFilter]);

  function exportRows(kind: ExportKind) {
    const filename = `cf-serviceops-customer-logs-${new Date().toISOString().slice(0, 10)}`;
    if (kind === "csv") exportCsv(filteredRows, filename);
    if (kind === "excel") exportExcel(filteredRows, filename);
    if (kind === "pdf") exportPdf(filteredRows, filename);
  }

  return (
    <section className="panel customer-logs-panel">
      <div className="panel-header">
        <div>
          <span>Customer Activity</span>
          <h3>Logs</h3>
        </div>
        <span className="badge">{filteredRows.length} entries</span>
      </div>
      <div className="logs-toolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customer, action, SO, Opp, Task, notes" />
        <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)} aria-label="Filter by customer">
          <option value="all">All customers</option>
          {customers.map((customer) => <option value={customer} key={customer}>{customer}</option>)}
        </select>
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} aria-label="Filter by action">
          <option value="all">All actions</option>
          {actions.map((action) => <option value={action} key={action}>{action}</option>)}
        </select>
        <div className="logs-export-actions">
          <button className="btn" type="button" onClick={() => exportRows("csv")}>CSV</button>
          <button className="btn" type="button" onClick={() => exportRows("excel")}>Excel</button>
          <button className="btn" type="button" onClick={() => exportRows("pdf")}>PDF</button>
        </div>
      </div>
      <div className="table-wrap logs-table-wrap">
        <table className="customer-logs-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Request</th>
              <th>Action</th>
              <th>Opp</th>
              <th>SO</th>
              <th>Task</th>
              <th>Result</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.id}>
                <td>{formatLogTime(row.timestamp)}</td>
                <td><strong><LogRecordLink type="customer" id={row.customerId} fallback={row.customerId || "-"} /></strong><span>{row.customerName || "Unknown"}</span></td>
                <td><span>{formatPhone(row.phone) || "-"}</span><small>{formatEmail(row.email) || "-"}</small></td>
                <td><span>{row.requestId || "-"}</span><small>{row.sourceRow ? `Row ${row.sourceRow}` : "-"}</small></td>
                <td><strong>{humanizeAction(row.action)}</strong><span>{row.user || "operator"}</span></td>
                <td><LogRecordLink type="opportunity" id={row.opportunityId} fallback={row.opportunityId || "-"} /></td>
                <td><LogRecordLink type="salesOrder" id={row.salesOrderId} fallback={row.salesOrderId || "-"} /></td>
                <td><LogRecordLink type="task" id={row.taskId} fallback={row.taskId || "-"} /></td>
                <td>{row.result || "-"}</td>
                <td>{row.details || row.preview || "-"}</td>
              </tr>
            ))}
            {!filteredRows.length ? <tr><td colSpan={10}>No logs match the current filters.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildCustomerLogs(auditRows: AuditLogEntry[], intakeRows: IntakeRow[]): CustomerLogRow[] {
  const bySourceRow = new Map(intakeRows.filter((row) => row.sourceRow).map((row) => [String(row.sourceRow), row]));
  const byCustomer = new Map(intakeRows.filter((row) => row.strivenCustomerId).map((row) => [row.strivenCustomerId, row]));
  const byOpp = new Map(intakeRows.filter((row) => row.strivenOppId).map((row) => [row.strivenOppId, row]));
  const bySo = new Map(intakeRows.flatMap((row) => [row.salesOrderNumber, row.strivenSoId].filter(Boolean).map((id) => [id, row] as const)));

  return auditRows.map((entry, index) => {
    const preview = parsePreview(entry.rawResponsePreview);
    const requestId = String(preview.requestId || "");
    const intake = bySourceRow.get(String(entry.sourceRow || "")) ||
      byCustomer.get(entry.strivenCustomerId || "") ||
      byOpp.get(entry.opportunityId || "") ||
      bySo.get(entry.salesOrderId || "");
    const customerId = entry.strivenCustomerId || intake?.strivenCustomerId || "";

    return {
      id: String(entry.id || `${entry.timestamp}-${index}`),
      timestamp: entry.timestamp,
      user: entry.user,
      action: entry.action,
      sourceRow: entry.sourceRow ? String(entry.sourceRow) : intake?.sourceRow ? String(intake.sourceRow) : "",
      requestId: requestId || intake?.id || "",
      customerId,
      customerName: intake ? [formatName(intake.firstName), formatName(intake.lastName)].filter(Boolean).join(" ") : "",
      phone: formatPhone(intake?.phone),
      email: formatEmail(intake?.email),
      opportunityId: entry.opportunityId || intake?.strivenOppId || "",
      salesOrderId: entry.salesOrderId || intake?.salesOrderNumber || intake?.strivenSoId || "",
      taskId: entry.taskId || "",
      result: entry.result,
      details: entry.errorMessage || String(preview.details || ""),
      preview: cleanPreview(entry.rawResponsePreview)
    };
  });
}

function LogRecordLink({ type, id, fallback }: { type: StrivenRecordType; id: unknown; fallback: string }) {
  if (!id || fallback === "-") return <>{fallback}</>;
  return <StrivenRecordLink type={type} id={id} label={`Open ${fallback} in Striven`} compact>{fallback}</StrivenRecordLink>;
}

function filterLogRows(rows: CustomerLogRow[], query: string, customer: string, action: string) {
  const needle = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (customer !== "all" && row.customerId !== customer && row.customerName !== customer) return false;
    if (action !== "all" && row.action !== action) return false;
    if (!needle) return true;
    return Object.values(row).some((value) => String(value || "").toLowerCase().includes(needle));
  });
}

function exportCsv(rows: CustomerLogRow[], filename: string) {
  downloadBlob(toCsv(rows), `${filename}.csv`, "text/csv;charset=utf-8");
}

function exportExcel(rows: CustomerLogRow[], filename: string) {
  const html = `<table>${tableHeaderHtml()}<tbody>${rows.map((row) => `<tr>${exportColumns(row).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  downloadBlob(html, `${filename}.xls`, "application/vnd.ms-excel;charset=utf-8");
}

function exportPdf(rows: CustomerLogRow[], filename: string) {
  const html = `<!doctype html><html><head><title>${escapeHtml(filename)}</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111827}h1{font-size:20px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #cbd5e1;padding:6px;vertical-align:top}th{background:#f1f5f9;text-align:left}</style></head><body><h1>CF ServiceOps Customer Logs</h1><table>${tableHeaderHtml()}<tbody>${rows.map((row) => `<tr>${exportColumns(row).map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.print()</script></body></html>`;
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) return;
  popup.document.write(html);
  popup.document.close();
}

function toCsv(rows: CustomerLogRow[]) {
  return [exportHeaders(), ...rows.map(exportColumns)]
    .map((line) => line.map((value) => `"${String(value || "").replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}

function exportHeaders() {
  return ["Time", "Customer #", "Customer Name", "Phone", "Email", "Request ID", "Source Row", "Action", "User", "Opp ID", "SO #", "Task #", "Result", "Details", "Preview"];
}

function exportColumns(row: CustomerLogRow) {
  return [row.timestamp, row.customerId, row.customerName, row.phone, row.email, row.requestId, row.sourceRow, row.action, row.user, row.opportunityId, row.salesOrderId, row.taskId, row.result, row.details, row.preview];
}

function tableHeaderHtml() {
  return `<thead><tr>${exportHeaders().map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>`;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parsePreview(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function cleanPreview(value: string) {
  return (value || "").replace(/\s+/g, " ").slice(0, 500);
}

function uniqueOptions(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function humanizeAction(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatLogTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
