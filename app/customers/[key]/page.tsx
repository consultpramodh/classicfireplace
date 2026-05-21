/*
 * 032_Customer_Dashboard_Page.tsx
 * Drilldown page for one customer or unresolved intake row.
 */

import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StrivenRecordLink } from "@/components/striven-record-link";
import { LOOKUP_ALIASES } from "@/lib/config/serviceops-config";
import { customerDisplayName } from "@/lib/serviceops/customer-links";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";
import { getCachedReportRowsForCustomer } from "@/lib/serviceops/snapshots";
import type { IntakeRow } from "@/lib/serviceops/types";
import { findValueByAliases, normalizeEmail, normalizePhone10, parseNumericId, safeText } from "@/lib/serviceops/normalization";
import type { ReportKey } from "@/lib/striven/reports";

export const dynamic = "force-dynamic";

type ReportResult = { rows: Record<string, unknown>[]; error: string; refreshedAt: string; stale: boolean };

const CUSTOMER_NUMBER_ALIASES = ["CustomerNumber", "Customer Number", "Customer No", "Customer #"] as const;
const STATUS_ALIASES = ["Status", "SOStatus", "SO Status", "TaskStatus", "Task Status", "OpportunityStatus", "Opportunity Status"] as const;
const CREATED_ALIASES = ["CreatedOn", "Created On", "CreatedDate", "Created Date", "OrderDate"] as const;
const TASK_NAME_ALIASES = ["TaskName", "Task Name", "Name", "Title"] as const;
const OPPORTUNITY_NAME_ALIASES = ["OpportunityName", "Opportunity Name", "Name", "Title"] as const;
const CLOSED_TASK_WORDS = ["completed", "complete", "closed", "cancelled", "canceled"];

export default async function CustomerDashboardPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const decodedKey = decodeURIComponent(key);

  const intake = await getCurrentIntakeRows();
  const selectedIntake = findSelectedIntakeRow(intake.rows, decodedKey);
  const initialCustomerId = parseNumericId(decodedKey) || parseNumericId(selectedIntake?.strivenCustomerId);
  const initialEmail = normalizeEmail(selectedIntake?.email || (decodedKey.includes("@") ? decodedKey : ""));
  const initialPhone = normalizePhone10(selectedIntake?.phone || selectedIntake?.altPhone || decodedKey);
  const initialAltPhone = normalizePhone10(selectedIntake?.altPhone);
  const initialCriteria = {
    customerId: initialCustomerId || "",
    customerNumber: "",
    email: initialEmail,
    phone: initialPhone,
    altPhone: initialAltPhone
  };

  const customersReport = loadReportForCustomer("customers", initialCriteria, shouldSearchCustomerReport(initialCustomerId, initialEmail, initialPhone, initialAltPhone), 20);
  const customerRows = customersReport.rows;
  const reportCustomer = findBestCustomerRow(customerRows, {
    customerId: initialCustomerId,
    email: initialEmail,
    phone: initialPhone,
    intakeRow: selectedIntake
  });

  const customerId = initialCustomerId || parseNumericId(value(reportCustomer, LOOKUP_ALIASES.customerId));
  const customerNumber = value(reportCustomer, CUSTOMER_NUMBER_ALIASES);
  const email = normalizeEmail(selectedIntake?.email || value(reportCustomer, LOOKUP_ALIASES.email));
  const phone = normalizePhone10(selectedIntake?.phone || value(reportCustomer, LOOKUP_ALIASES.phone));
  const altPhone = normalizePhone10(selectedIntake?.altPhone || value(reportCustomer, LOOKUP_ALIASES.altPhone));
  const matchInput = { customerId, customerNumber, email, phone, altPhone };
  const reports = loadRelatedReports(matchInput, !!(customerId || customerNumber || email || phone || altPhone));

  const intakeRows = intake.rows.filter((row) => intakeRowMatches(row, {
    selectedSourceRow: selectedIntake?.sourceRow || 0,
    customerId,
    email,
    phone,
    altPhone
  }));

  const locations = reports.customerLocations.rows.filter((row) => reportRowMatchesCustomer(row, matchInput));
  const workOrders = reports.serviceWorkOrders.rows.filter((row) => reportRowMatchesCustomer(row, matchInput));
  const opportunities = reports.opportunities.rows.filter((row) => reportRowMatchesCustomer(row, matchInput));
  const assets = reports.customerAssets.rows.filter((row) => reportRowMatchesCustomer(row, matchInput));
  const tasks = reports.serviceTasks.rows.filter((row) => reportRowMatchesCustomer(row, matchInput));
  const openTasks = tasks.filter(isOpenTask);

  const titleName =
    safeText(value(reportCustomer, LOOKUP_ALIASES.customerName)) ||
    (selectedIntake ? customerDisplayName(selectedIntake) : "") ||
    "Customer Dashboard";

  const fullAddress = [
    selectedIntake?.street || value(reportCustomer, LOOKUP_ALIASES.street),
    selectedIntake?.city || value(reportCustomer, LOOKUP_ALIASES.city),
    selectedIntake?.province || value(reportCustomer, LOOKUP_ALIASES.province),
    selectedIntake?.postalCode || value(reportCustomer, LOOKUP_ALIASES.postalCode)
  ].filter(Boolean).join(", ");

  const reportErrors = [["customers", customersReport] as const, ...Object.entries(reports)]
    .filter(([, report]) => report.error)
    .map(([name, report]) => `${name}: ${report.error}`);

  return (
    <AppFrame>
      <PageHeader
        title={titleName}
        description="A customer-level view of intake history, contact details, Striven report data, assets, opportunities, work orders, and open tasks."
        actions={<Link className="btn" href="/intake"><ArrowLeft size={16} /> Intake</Link>}
      />

      {intake.error || reportErrors.length ? (
        <section className="panel live-note" style={{ marginBottom: 16 }}>
          <strong>Live data note</strong>
          <p>
          {[intake.error, ...reportErrors].filter(Boolean).join(" ")}
          </p>
        </section>
      ) : null}

      <section className="customer-hero panel">
        <div className="customer-identity">
          <span className="badge info">Customer Dashboard</span>
          <h2>{titleName}</h2>
          <div className="customer-contact-strip">
            <span><UserRound size={15} /> {customerId || customerNumber || "Unresolved customer"}</span>
            <span><Mail size={15} /> {selectedIntake?.email || value(reportCustomer, LOOKUP_ALIASES.email) || "No email"}</span>
            <span><Phone size={15} /> {selectedIntake?.phone || value(reportCustomer, LOOKUP_ALIASES.phone) || "No phone"}</span>
            <span><MapPin size={15} /> {fullAddress || "No address"}</span>
          </div>
        </div>
        <div className="customer-mini-metrics">
          <Metric label="Intake Rows" value={intakeRows.length} />
          <Metric label="Opportunities" value={opportunities.length} />
          <Metric label="Work Orders" value={workOrders.length} />
          <Metric label="Open Tasks" value={openTasks.length} tone={openTasks.length ? "warn" : "ok"} />
          <Metric label="Assets" value={assets.length} />
        </div>
      </section>

      <section className="customer-grid">
        <Panel title="Profile">
          <Key label="Customer ID" value={customerId ? String(customerId) : "-"} after={<StrivenRecordLink type="customer" id={customerId} compact />} />
          <Key label="Customer Number" value={customerNumber || "-"} />
          <Key label="Name" value={titleName} />
          <Key label="Email" value={selectedIntake?.email || value(reportCustomer, LOOKUP_ALIASES.email) || "-"} />
          <Key label="Phone" value={selectedIntake?.phone || value(reportCustomer, LOOKUP_ALIASES.phone) || "-"} />
          <Key label="Alt Phone" value={selectedIntake?.altPhone || value(reportCustomer, LOOKUP_ALIASES.altPhone) || "-"} />
          <Key label="Address" value={fullAddress || "-"} />
        </Panel>

        <Panel title="Latest Request">
          {selectedIntake ? (
            <>
              <Key label="Web Form Row" value={String(selectedIntake.sourceRow)} />
              <Key label="Submitted" value={selectedIntake.submittedAt || "-"} />
              <Key label="Preferred Days" value={selectedIntake.preferredDays || "-"} />
              <Key label="Make/Model/Age" value={selectedIntake.makeModelAge || "-"} />
              <Key label="Details" value={selectedIntake.details || "-"} />
              <Key label="State" value={selectedIntake.pipelineState || "-"} />
            </>
          ) : (
            <div className="empty">No matching Web Form row was found for this customer key.</div>
          )}
        </Panel>
      </section>

      <section className="customer-grid">
        <Panel title="Locations">
          <SimpleTable
            rows={locations.slice(0, 8)}
            empty="No locations found in the synced Striven location report."
            columns={[
              ["Location ID", (row) => value(row, LOOKUP_ALIASES.customerLocationId) || value(row, ["Id"])],
              ["Name", (row) => value(row, ["LocationName", "Location Name", "Name"]) || "-"],
              ["Address", (row) => [value(row, LOOKUP_ALIASES.street), value(row, LOOKUP_ALIASES.city), value(row, LOOKUP_ALIASES.postalCode)].filter(Boolean).join(", ") || "-"]
            ]}
          />
        </Panel>

        <Panel title="Intake History">
          <SimpleTable
            rows={intakeRows.slice(0, 8)}
            empty="No related Web Form rows found."
            columns={[
              ["Row", (row) => String((row as IntakeRow).sourceRow)],
              ["Submitted", (row) => (row as IntakeRow).submittedAt || "-"],
              ["State", (row) => <StatusBadge value={(row as IntakeRow).pipelineState || "-"} />],
              ["SO", (row) => <RecordCell value={(row as IntakeRow).salesOrderNumber || (row as IntakeRow).strivenSoId || "-"} type="salesOrder" id={(row as IntakeRow).strivenSoId} />]
            ]}
          />
        </Panel>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header"><h3>Service Work Orders</h3><span className="badge">{workOrders.length}</span></div>
        <SimpleTable
          rows={workOrders.slice(0, 12)}
          empty="No service work orders found for this customer."
          columns={[
            ["SO #", (row) => <RecordCell value={value(row, LOOKUP_ALIASES.salesOrderNumber) || "-"} type="salesOrder" id={value(row, LOOKUP_ALIASES.salesOrderId) || value(row, LOOKUP_ALIASES.workOrderId)} />],
            ["Status", (row) => <StatusBadge value={value(row, STATUS_ALIASES) || "-"} />],
            ["Created", (row) => value(row, CREATED_ALIASES) || "-"],
            ["Scheduled", (row) => value(row, ["ServiceWorkOrderScheduledDate", "ScheduledDate", "Scheduled Date"]) || "-"],
            ["Model", (row) => value(row, ["ServiceWorkOrderManufacturerandModel", "ManufacturerModel", "Model"]) || "-"],
            ["Tech", (row) => value(row, ["ServiceWorkOrderServiceTech", "ServiceTech", "Tech"]) || "-"]
          ]}
        />
      </section>

      <section className="customer-grid" style={{ marginTop: 16 }}>
        <Panel title="Opportunities">
          <SimpleTable
            rows={opportunities.slice(0, 10)}
            empty="No opportunities found for this customer."
            columns={[
              ["ID", (row) => <RecordCell value={value(row, ["OpportunityId", "Opportunity ID", "Id"]) || "-"} type="opportunity" id={value(row, ["OpportunityId", "Opportunity ID", "Id"])} />],
              ["Name", (row) => value(row, OPPORTUNITY_NAME_ALIASES) || "-"],
              ["Status", (row) => <StatusBadge value={value(row, STATUS_ALIASES) || "-"} />],
              ["Created", (row) => value(row, CREATED_ALIASES) || "-"]
            ]}
          />
        </Panel>

        <Panel title="Open Tasks">
          <SimpleTable
            rows={openTasks.slice(0, 10)}
            empty="No open tasks found for this customer."
            columns={[
              ["Task ID", (row) => <RecordCell value={value(row, ["TaskId", "Task ID", "Id"]) || "-"} type="task" id={value(row, ["TaskId", "Task ID", "Id"])} />],
              ["Task", (row) => value(row, TASK_NAME_ALIASES) || "-"],
              ["Status", (row) => <StatusBadge value={value(row, STATUS_ALIASES) || "-"} />],
              ["Due", (row) => value(row, ["DueDate", "DueDateTime", "Due Date"]) || "-"]
            ]}
          />
        </Panel>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header"><h3>Assets</h3><span className="badge">{assets.length}</span></div>
        <SimpleTable
          rows={assets.slice(0, 12)}
          empty="No customer assets found for this customer."
          columns={[
            ["Asset", (row) => <RecordCell value={value(row, LOOKUP_ALIASES.assetName) || "-"} type="asset" id={value(row, LOOKUP_ALIASES.customerAssetId)} />],
            ["Manufacturer", (row) => value(row, LOOKUP_ALIASES.manufacturerName) || "-"],
            ["Model", (row) => value(row, LOOKUP_ALIASES.modelNumber) || "-"],
            ["Purchased", (row) => value(row, LOOKUP_ALIASES.datePurchased) || "-"]
          ]}
        />
      </section>
    </AppFrame>
  );
}

function loadReportForCustomer(
  key: ReportKey,
  input: { customerId: number | string; customerNumber: string; email: string; phone: string; altPhone: string },
  enabled = true,
  limit = 500
): ReportResult {
  if (!enabled) return { rows: [], error: "", refreshedAt: "", stale: true };
  return getCachedReportRowsForCustomer(key, input, limit);
}

function loadRelatedReports(
  input: { customerId: number; customerNumber: string; email: string; phone: string; altPhone: string },
  enabled: boolean
): Record<ReportKey, ReportResult> {
  const keys: ReportKey[] = ["customerLocations", "serviceWorkOrders", "serviceTasks", "opportunities", "customerAssets"];
  const entries = keys.map((key) => [key, loadReportForCustomer(key, input, enabled)] as const);

  return Object.fromEntries([
    ["customers", { rows: [], error: "", refreshedAt: "", stale: true }] as const,
    ...entries
  ]) as Record<ReportKey, ReportResult>;
}

function shouldSearchCustomerReport(customerId: number, email: string, phone: string, altPhone: string) {
  return !!(customerId || email || phone || altPhone);
}

function findSelectedIntakeRow(rows: IntakeRow[], key: string): IntakeRow | null {
  const rowMatch = key.match(/^row-(\d+)$/i);
  if (rowMatch) {
    return rows.find((row) => row.sourceRow === Number(rowMatch[1])) || null;
  }

  const customerId = parseNumericId(key);
  if (customerId) {
    const byCustomer = rows.find((row) => parseNumericId(row.strivenCustomerId) === customerId);
    if (byCustomer) return byCustomer;
  }

  const email = normalizeEmail(key);
  if (email.includes("@")) {
    const byEmail = rows.find((row) => normalizeEmail(row.email) === email);
    if (byEmail) return byEmail;
  }

  const phone = normalizePhone10(key);
  if (phone) {
    return rows.find((row) => normalizePhone10(row.phone) === phone || normalizePhone10(row.altPhone) === phone) || null;
  }

  return null;
}

function findBestCustomerRow(rows: Record<string, unknown>[], input: { customerId: number; email: string; phone: string; intakeRow: IntakeRow | null }) {
  if (input.customerId) {
    const byId = rows.find((row) => parseNumericId(value(row, LOOKUP_ALIASES.customerId)) === input.customerId);
    if (byId) return byId;
  }

  if (input.email) {
    const byEmail = rows.find((row) => normalizeEmail(value(row, LOOKUP_ALIASES.email)) === input.email);
    if (byEmail) return byEmail;
  }

  if (input.phone) {
    const byPhone = rows.find((row) => normalizePhone10(value(row, LOOKUP_ALIASES.phone)) === input.phone || normalizePhone10(value(row, LOOKUP_ALIASES.altPhone)) === input.phone);
    if (byPhone) return byPhone;
  }

  if (input.intakeRow) {
    const name = customerDisplayName(input.intakeRow).toLowerCase();
    return rows.find((row) => safeText(value(row, LOOKUP_ALIASES.customerName)).toLowerCase() === name) || null;
  }

  return null;
}

function intakeRowMatches(row: IntakeRow, input: { selectedSourceRow: number; customerId: number; email: string; phone: string; altPhone: string }) {
  if (input.selectedSourceRow && row.sourceRow === input.selectedSourceRow) return true;
  if (input.customerId && parseNumericId(row.strivenCustomerId) === input.customerId) return true;
  if (input.email && normalizeEmail(row.email) === input.email) return true;
  if (input.phone && (normalizePhone10(row.phone) === input.phone || normalizePhone10(row.altPhone) === input.phone)) return true;
  if (input.altPhone && (normalizePhone10(row.phone) === input.altPhone || normalizePhone10(row.altPhone) === input.altPhone)) return true;
  return false;
}

function reportRowMatchesCustomer(row: Record<string, unknown>, input: { customerId: number; customerNumber: string; email: string; phone: string; altPhone: string }) {
  const rowCustomerId = parseNumericId(value(row, LOOKUP_ALIASES.customerId));
  const rowCustomerNumber = value(row, CUSTOMER_NUMBER_ALIASES);
  const rowEmail = normalizeEmail(value(row, LOOKUP_ALIASES.email));
  const rowPhone = normalizePhone10(value(row, LOOKUP_ALIASES.phone));
  const rowAltPhone = normalizePhone10(value(row, LOOKUP_ALIASES.altPhone));

  if (input.customerId && rowCustomerId === input.customerId) return true;
  if (input.customerNumber && rowCustomerNumber && rowCustomerNumber === input.customerNumber) return true;
  if (input.email && rowEmail === input.email) return true;
  if (input.phone && (rowPhone === input.phone || rowAltPhone === input.phone)) return true;
  if (input.altPhone && (rowPhone === input.altPhone || rowAltPhone === input.altPhone)) return true;

  return false;
}

function isOpenTask(row: Record<string, unknown>) {
  const status = value(row, STATUS_ALIASES).toLowerCase();
  if (!status) return true;
  return !CLOSED_TASK_WORDS.some((word) => status.includes(word));
}

function value(row: Record<string, unknown> | null | undefined, aliases: readonly string[]) {
  if (!row) return "";
  return safeText(findValueByAliases(row, aliases));
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="customer-metric">
      <span>{label}</span>
      <strong className={tone || ""}>{value}</strong>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header"><h3>{title}</h3></div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function Key({ label, value, after }: { label: string; value: string; after?: ReactNode }) {
  return <div className="kv"><span>{label}</span><strong>{value}{after ? <span className="kv-action">{after}</span> : null}</strong></div>;
}

function RecordCell({ value, type, id }: { value: ReactNode; type: "customer" | "opportunity" | "salesOrder" | "task" | "asset"; id: unknown }) {
  const numericId = parseNumericId(id);
  return (
    <span className="record-cell">
      {numericId ? <StrivenRecordLink type={type} id={numericId} compact>{value}</StrivenRecordLink> : <span>{value}</span>}
    </span>
  );
}

function SimpleTable<T extends Record<string, unknown> | IntakeRow>({
  rows,
  columns,
  empty
}: {
  rows: T[];
  empty: string;
  columns: [string, (row: T) => ReactNode][];
}) {
  if (!rows.length) {
    return <div className="empty">{empty}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(("id" in row && row.id) || value(row as Record<string, unknown>, ["Id", "TaskId", "OpportunityId"]) || index)}>
              {columns.map(([label, render]) => <td key={label}>{render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
