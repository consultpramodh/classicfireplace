"use client";

/*
 * 017_Intake_Dashboard.tsx
 * Client dashboard view. Data comes from server API; no secrets are stored here.
 */

import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import type { AuditLogEntry, IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import { REVIEW_FILTERS } from "@/lib/config/serviceops-config";
import { customerDashboardHref, customerDisplayName } from "@/lib/serviceops/customer-links";
import { ActionButton } from "./action-button";
import { StatusBadge } from "./status-badge";
import { TaskStatusList } from "./task-status-list";

export function IntakeDashboard({ initialRows, initialTaskRows, initialAudit }: {
  initialRows: IntakeRow[];
  initialTaskRows: TaskMappingRow[];
  initialAudit: AuditLogEntry[];
}) {
  const [rows, setRows] = useState(initialRows);
  const [taskRows] = useState(initialTaskRows);
  const [audit] = useState(initialAudit);
  const [filter, setFilter] = useState("New Intake");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<IntakeRow | null>(initialRows[0] || null);

  async function reload() {
    const res = await fetch("/api/intake", { cache: "no-store" });
    const data = await res.json();
    setRows(data.rows);
    setSelected(data.rows.find((row: IntakeRow) => row.sourceRow === selected?.sourceRow) || data.rows[0] || null);
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !q || [row.firstName, row.lastName, row.email, row.phone, row.city, row.sourceRow].join(" ").toLowerCase().includes(q);
      const matchesFilter =
        filter === "New Intake" ? true :
        filter === "Needs Review" ? row.needsReview :
        filter === "Customer Resolved" ? !!row.strivenCustomerId :
        filter === "Opportunity Created" ? !!row.strivenOppId :
        filter === "Ready for SO" ? row.opportunityStage === "Service Work Order Created" && !row.strivenSoId :
        filter === "SO Created" ? !!row.strivenSoId :
        filter === "Task Matched" ? row.taskMatched :
        filter === "Error" ? row.pipelineState === "ERROR" || !!row.lastError :
        true;
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  const metrics = {
    intake: rows.length,
    review: rows.filter((r) => r.needsReview).length,
    ready: rows.filter((r) => r.opportunityStage === "Service Work Order Created" && !r.strivenSoId).length,
    errors: rows.filter((r) => r.pipelineState === "ERROR" || r.lastError).length
  };

  return (
    <>
      <div className="topbar" id="dashboard">
        <div>
          <h2>Service Operations Dashboard</h2>
          <p>Intake, matching, opportunity review, sales order gating, task mapping, and audit history.</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={reload}><RefreshCw size={16} /> Reload</button>
          <ActionButton action="refresh_reports" label="Refresh reports" variant="primary" onDone={setMessage} />
        </div>
      </div>

      {message ? <div className="panel" style={{ padding: 12, marginBottom: 16 }}>{message}</div> : null}

      <section className="grid metrics">
        <div className="metric"><span>Intake rows</span><strong>{metrics.intake}</strong></div>
        <div className="metric"><span>Needs review</span><strong>{metrics.review}</strong></div>
        <div className="metric"><span>Ready for SO</span><strong>{metrics.ready}</strong></div>
        <div className="metric"><span>Errors</span><strong>{metrics.errors}</strong></div>
      </section>

      <section className="detail-grid" id="intake">
        <div className="panel">
          <div className="panel-header">
            <h3>Review Queue</h3>
            <span className="badge info">{filtered.length} rows</span>
          </div>
          <div className="filters">
            <label>
              <Search size={15} />{" "}
              <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, city, row" />
            </label>
            <select className="select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              {REVIEW_FILTERS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Customer ID</th>
                  <th>City</th>
                  <th>State</th>
                  <th>Customer</th>
                  <th>Opp</th>
                  <th>SO</th>
                  <th>SO Status</th>
                  <th>Clean Task</th>
                  <th>Last Error</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} onClick={() => setSelected(row)} style={{ cursor: "pointer" }}>
                    <td>{row.sourceRow}</td>
                    <td><Link className="inline-link" href={customerDashboardHref(row)}>{customerDisplayName(row)}</Link></td>
                    <td>{row.city || "-"}</td>
                    <td><StatusBadge value={row.pipelineState} /></td>
                    <td>{row.strivenCustomerId ? <span className="badge ok">{row.strivenCustomerId}</span> : <span className="badge warn">Missing</span>}</td>
                    <td>{row.strivenOppId ? <span className="badge ok">{row.strivenOppId}</span> : <span className="badge warn">Missing</span>}</td>
                    <td>{row.strivenSoId ? <span className="badge ok">{row.salesOrderNumber || row.strivenSoId}</span> : <span className="badge">Not created</span>}</td>
                    <td>{row.salesOrderStatus || "-"}</td>
                    <td><TaskStatusList value={row.cleanServiceTaskStatus || ""} compact /></td>
                    <td>{row.lastError || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DetailDrawer row={selected} onDone={(msg) => { setMessage(msg); reload(); }} />
      </section>

      <section className="panel" id="tasks-and-calendar" style={{ marginTop: 16 }}>
        <div className="panel-header"><h3>Tasks & Calendar Mapping</h3><span className="badge">{taskRows.length} rows</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Tech</th><th>Event</th><th>SO#</th><th>Task</th><th>Dates</th><th>Status</th></tr></thead>
            <tbody>
              {taskRows.map((row) => (
                <tr key={row.eventId}>
                  <td>{row.tech}</td>
                  <td>{row.title}</td>
                  <td>{row.soNumber || <span className="badge warn">Missing</span>}</td>
                  <td>{row.taskId || <span className="badge warn">Unmatched</span>}</td>
                  <td><StatusBadge value={row.datesMatch || "Not checked"} /></td>
                  <td><StatusBadge value={row.rowStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" id="audit-log" style={{ marginTop: 16 }}>
        <div className="panel-header"><h3>Audit Log</h3><span className="badge">{audit.length} latest</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Row</th><th>Result</th><th>Message</th></tr></thead>
            <tbody>
              {audit.map((entry, index) => (
                <tr key={entry.id || index}>
                  <td>{entry.timestamp}</td>
                  <td>{entry.action}</td>
                  <td>{entry.sourceRow || "-"}</td>
                  <td><StatusBadge value={entry.result} /></td>
                  <td>{entry.errorMessage || entry.rawResponsePreview || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DetailDrawer({ row, onDone }: { row: IntakeRow | null; onDone: (message: string) => void }) {
  if (!row) {
    return <aside className="drawer empty">Select an intake row.</aside>;
  }

  return (
    <aside className="drawer" id="review-queue">
      <h3>Row {row.sourceRow}</h3>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <ActionButton action="resolve_customer" sourceRow={row.sourceRow} label="Resolve customer" onDone={onDone} />
        <ActionButton action="create_opportunity" sourceRow={row.sourceRow} label="Create opportunity" onDone={onDone} />
        <ActionButton action="check_opportunity_stage" sourceRow={row.sourceRow} label="Check stage" onDone={onDone} />
        <ActionButton action="create_sales_order" sourceRow={row.sourceRow} label="Create sales order" variant="warning" onDone={onDone} />
        <ActionButton action="rebuild_profile" sourceRow={row.sourceRow} label="Rebuild profile" onDone={onDone} />
        <ActionButton action="mark_reviewed" sourceRow={row.sourceRow} label="Mark reviewed" onDone={onDone} />
      </div>
      <Key label="Submitted" value={row.submittedAt} />
      <div className="kv"><span>Customer</span><strong><Link className="inline-link" href={customerDashboardHref(row)}>{customerDisplayName(row)}</Link></strong></div>
      <Key label="Phone" value={row.phone} />
      <Key label="Email" value={row.email || "-"} />
      <Key label="Address" value={[row.street, row.city, row.province, row.postalCode].filter(Boolean).join(", ")} />
      <Key label="Preferred" value={row.preferredDays || "-"} />
      <Key label="Make/Model/Age" value={row.makeModelAge || "-"} />
      <Key label="Opportunity Stage" value={row.opportunityStage || "-"} />
      <Key label="Sales Order Status" value={row.salesOrderStatus || "-"} />
      <div className="kv"><span>Clean and Service Task Status</span><strong><TaskStatusList value={row.cleanServiceTaskStatus || ""} /></strong></div>
      <Key label="Details" value={row.details || "-"} />
      <Key label="Review" value={row.needsReview ? "Yes" : "No"} />
      <Key label="Last Error" value={row.lastError || "-"} />
    </aside>
  );
}

function Key({ label, value }: { label: string; value: string }) {
  return <div className="kv"><span>{label}</span><strong>{value}</strong></div>;
}
