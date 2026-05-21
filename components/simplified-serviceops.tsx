"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import type { IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import { buildServiceLifecycle } from "@/lib/serviceops/lifecycle";
import { sortRequestsRecentFirst } from "@/lib/serviceops/sorting";
import { dedupeIntakeForms } from "@/lib/serviceops/dedupe";
import { deriveApplianceInstallTag } from "@/lib/serviceops/appliance-tags";
import { formatAddressParts, formatEmail, formatName, formatPhone } from "@/lib/serviceops/normalization";
import { StrivenRecordLink, type StrivenRecordType } from "@/components/striven-record-link";

export type SimpleOpsView = "command" | "pipeline" | "work-item" | "review" | "calendar" | "admin";

type LivePayload = {
  rows: IntakeRow[];
  taskRows: TaskMappingRow[];
  customerHistory?: Record<string, CustomerHistorySummary>;
  source: "demo" | "cache" | "empty";
  refreshedAt?: string;
  stale?: boolean;
  error?: string;
  intake?: DataSourceState;
  tasks?: DataSourceState;
};

type CustomerHistorySummary = {
  invoices: { invoiceId: string; invoiceDate: string; salesOrderNumber: string; assetId: string; assetDescription: string; serialNumber: string; amount: string }[];
  assets: { assetId: string; assetName: string; manufacturer: string; model: string; serialNumber: string; purchasedAt: string }[];
  installationTasks?: { taskId: string; taskName: string; taskStatus: string; salesOrderNumber: string; assignedTo: string; scheduledAt: string }[];
  warnings?: string[];
};

type DataSourceState = {
  source: "demo" | "cache" | "empty";
  refreshedAt?: string;
  stale?: boolean;
  error?: string;
  count: number;
};

type Stage = "New Requests" | "Opportunity" | "Approved for SWO" | "Work Order Created" | "Scheduled" | "Completed" | "Review";
type ScopeKey = "today" | "yesterday" | "last3" | "last7" | "thisMonth" | "all";
type WorkFlowStep = {
  key: string;
  label: string;
  value: string;
  helper: string;
  state: "done" | "current" | "todo" | "blocked";
  type?: StrivenRecordType;
  id?: unknown;
};

const stages: Stage[] = ["New Requests", "Opportunity", "Approved for SWO", "Work Order Created", "Scheduled", "Completed", "Review"];
const bulkActions = [
  { action: "resolve_customer", label: "Resolve Customers" },
  { action: "ensure_customer_details", label: "Repair Details" },
  { action: "create_opportunity", label: "Create Opps" },
  { action: "check_opportunity_stage", label: "Check Opps" },
  { action: "create_sales_order", label: "Create SOs" },
  { action: "repair_request", label: "Re-check" }
] as const;
const scopeOptions: { key: ScopeKey; label: string; helper: string }[] = [
  { key: "today", label: "Today", helper: "Submitted today" },
  { key: "yesterday", label: "Yesterday", helper: "Submitted yesterday" },
  { key: "last3", label: "Last 3 Days", helper: "Recent follow-up" },
  { key: "last7", label: "Last 7 Days", helper: "Weekly triage" },
  { key: "thisMonth", label: "This Month", helper: "Monthly workload" },
  { key: "all", label: "All Cached", helper: "Every cached row" }
];

export function SimplifiedServiceOps({ view, requestId, pipelineStage, initial }: { view: SimpleOpsView; requestId?: string; pipelineStage?: string; initial: LivePayload }) {
  const [data, setData] = useState(() => normalizePayload(initial));
  const [selectedId, setSelectedId] = useState(requestId || sortRequestsRecentFirst(initial.rows)[0]?.id || "");
  const [scope, setScope] = useState<ScopeKey>("thisMonth");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyRowId, setBusyRowId] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isPending] = useTransition();
  const scopeWrapRef = useRef<HTMLDivElement | null>(null);

  const allRows = useMemo(() => sortRequestsRecentFirst(data.rows), [data.rows]);
  const recentRows = useMemo(() => scopedIntakeRows(allRows, scope), [allRows, scope]);
  const visibleTaskRows = useMemo(() => scopedTaskRows(data.taskRows, scope), [data.taskRows, scope]);
  const selected = recentRows.find((row) => row.id === selectedId) || recentRows[0];
  const scopeMeta = scopeSummary(scope);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!scopeWrapRef.current?.contains(event.target as Node)) setScopeOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setScopeOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  async function refreshLiveData() {
    setRefreshing(true);
    setActionMessage("");
    try {
      await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "refresh_reports" }) });
      await refreshPayload();
      setActionMessage("Live cache refreshed.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function syncStatuses() {
    setRefreshing(true);
    setActionMessage("");
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync_statuses" }) });
      const result = await response.json() as { message?: string };
      await refreshPayload();
      setActionMessage(result.message || "Statuses synced.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshPayload() {
    const response = await fetch("/api/intake", { cache: "no-store" });
    const normalized = normalizePayload(await response.json() as LivePayload);
    setData(normalized);
    if (!selectedId && normalized.rows[0]) setSelectedId(normalized.rows[0].id);
  }

  async function runRowAction(row: IntakeRow, actionOverride?: string, extraPayload: Record<string, unknown> = {}) {
    const action = actionOverride || actionNameFor(row);
    if (!action) return;
    setBusyRowId(row.id);
    setActionMessage("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, sourceRow: row.sourceRow, ...extraPayload })
      });
      const result = await response.json() as { message?: string };
      await refreshPayload();
      setActionMessage(result.message || "Action completed.");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusyRowId("");
    }
  }

  async function runBulkAction(rows: IntakeRow[], action: string) {
    const actionableRows = rows.filter((row) => row.sourceRow);
    if (!action || !actionableRows.length) return;
    setBusyRowId("bulk");
    setActionMessage("");
    try {
      const results = [];
      for (const row of actionableRows) {
        const response = await fetch("/api/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, sourceRow: row.sourceRow })
        });
        const result = await response.json() as { ok?: boolean };
        results.push(result);
      }
      await refreshPayload();
      const failed = results.filter((result) => !result.ok).length;
      setActionMessage(failed
        ? `${actionLabelFor(action)} finished for ${results.length - failed}/${results.length} selected rows. ${failed} need review.`
        : `${actionLabelFor(action)} finished for ${results.length} selected row${results.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBusyRowId("");
    }
  }

  return (
    <div className="ops-console">
      <header className="ops-hero">
        <div>
          <span className="lux-label">Classic Fireplace ServiceOps</span>
          <h2>{titleFor(view)}</h2>
          <p>{subtitleFor(view)}</p>
        </div>
        <div className="ops-hero-actions">
          <DataHealth data={data} />
          <button className="btn primary" type="button" onClick={refreshLiveData} disabled={refreshing || isPending}>
            {refreshing ? "Working..." : "Refresh Live Data"}
          </button>
        </div>
      </header>
      {actionMessage ? <div className="ops-message">{actionMessage}</div> : null}
      <section className={`top-status-strip ${view === "work-item" ? "single" : ""}`} aria-label="Work scope and data health">
        <div className="scope-banner" ref={scopeWrapRef}>
          <button className="scope-trigger" type="button" onClick={() => setScopeOpen((value) => !value)} aria-expanded={scopeOpen}>
            <span>{scopeMeta.label}</span>
            <strong>{scopeMeta.value}</strong>
          </button>
          <em>{recentRows.length} requests · {visibleTaskRows.length} task rows</em>
          {scopeOpen ? (
            <div className="scope-options" role="menu">
              {scopeOptions.map((option) => (
                <button className={scope === option.key ? "active" : ""} type="button" role="menuitem" key={option.key} onClick={() => { setScope(option.key); setScopeOpen(false); }}>
                  <span>{option.label}</span>
                  <strong>{scopedIntakeRows(allRows, option.key).length}</strong>
                  <small>{option.helper} · {scopedTaskRows(data.taskRows, option.key).length} task rows</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {view === "work-item" ? null : <DataFlowStrip data={data} />}
      </section>
      {view === "command" ? <CommandCenter rows={recentRows} taskRows={visibleTaskRows} refreshLiveData={refreshLiveData} syncStatuses={syncStatuses} refreshing={refreshing} refreshedAt={data.refreshedAt || ""} stale={Boolean(data.stale)} /> : null}
      {view === "pipeline" ? <PipelineBoard rows={recentRows} activeStage={stageFromParam(pipelineStage)} runRowAction={runRowAction} runBulkAction={runBulkAction} busyRowId={busyRowId} /> : null}
      {view === "work-item" && selected ? <WorkItem row={selected} taskRows={visibleTaskRows} customerHistory={data.customerHistory?.[selected.strivenCustomerId || ""]} runRowAction={runRowAction} busy={busyRowId === selected.id} /> : null}
      {view === "review" ? <ReviewDesk rows={recentRows.filter(isReviewRow)} runRowAction={runRowAction} busyRowId={busyRowId} /> : null}
      {view === "calendar" ? <CalendarMapping taskRows={visibleTaskRows} /> : null}
      {view === "admin" ? <AdminPanel data={data} /> : null}
    </div>
  );
}

function DataFlowStrip({ data }: { data: LivePayload }) {
  const intake = data.intake || { source: data.source, refreshedAt: data.refreshedAt, stale: data.stale, error: data.error, count: data.rows.length };
  const tasks = data.tasks || { source: data.source, refreshedAt: data.refreshedAt, stale: data.stale, error: data.error, count: data.taskRows.length };
  return (
    <section className="data-flow-strip" aria-label="Data flow health">
      <DataFlowNode label="Web Form Intake" state={intake} />
      <DataFlowNode label="Service Task Mapping" state={tasks} />
      <DataFlowNode label="Operator Workspace" state={{ source: data.source, refreshedAt: data.refreshedAt, stale: data.stale, error: data.error, count: data.rows.length + data.taskRows.length }} />
    </section>
  );
}

function DataFlowNode({ label, state }: { label: string; state: DataSourceState }) {
  const tone = state.error ? "error" : state.stale ? "stale" : state.source === "empty" ? "empty" : "ok";
  return (
    <div className={`data-flow-node ${tone}`}>
      <span>{label}</span>
      <strong>{state.count}</strong>
      <small>{state.source}{state.refreshedAt ? ` · ${formatDate(state.refreshedAt)}` : ""}</small>
      {state.error ? <em>{state.error}</em> : null}
    </div>
  );
}

function CommandCenter({ rows, taskRows, refreshLiveData, syncStatuses, refreshing, refreshedAt, stale }: { rows: IntakeRow[]; taskRows: TaskMappingRow[]; refreshLiveData: () => void; syncStatuses: () => void; refreshing: boolean; refreshedAt: string; stale: boolean }) {
  const recentRows = sortRequestsRecentFirst(rows);
  const review = byStage(recentRows, "Review");
  const awaiting = byStage(recentRows, "Approved for SWO");
  const syncIssues = taskRows.filter((row) => row.rowStatus && row.rowStatus !== "In Sync");
  const nextWork = [review, byStage(recentRows, "New Requests"), byStage(recentRows, "Opportunity"), awaiting, byStage(recentRows, "Work Order Created"), byStage(recentRows, "Scheduled")].flat().slice(0, 6);
  const risks = [
    ["Duplicate risk", review.filter((row) => /duplicate/i.test(row.lastError || row.pipelineState)).length || review.length],
    ["Missing location", rows.filter((row) => !row.street || !row.city).length],
    ["Active work order exists", review.filter((row) => /active work/i.test(row.lastError)).length],
    ["Zero price service item", review.filter((row) => /zero|price/i.test(row.lastError)).length]
  ] as const;

  return (
    <div className="apple-dashboard">
      <div className="dashboard-main-stack">
        <section className="focus-hero-card">
          <div className="focus-copy">
            <span>Today</span>
            <h3>Today&apos;s ServiceOps Focus</h3>
            <p>Highest priority requests, approvals, and sync blockers.</p>
            <div className="focus-actions">
              <Link className="btn primary" href="/review-queue">Open Review Queue</Link>
              <button className="btn" type="button" onClick={refreshLiveData} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh Live Data"}</button>
            </div>
          </div>
          <div className="workflow-visual" aria-label="Pipeline workflow">
            {stages.slice(0, 6).map((stage) => (
              <Link href={`/pipeline?stage=${encodeURIComponent(stage)}`} key={stage}>
                <span>{stage}</span>
                <strong>{byStage(recentRows, stage).length}</strong>
              </Link>
            ))}
          </div>
        </section>
        <section className="next-work-card">
          <div className="soft-section-title"><span>Next Best Work</span><h3>Start Here</h3></div>
          <div className="work-list">{nextWork.map((row) => <WorkListItem row={row} key={row.id} />)}</div>
        </section>
        <section className="risk-section">
          <div className="soft-section-title"><span>Risks</span><h3>Watch List</h3></div>
          <div className="risk-grid">
            {risks.map(([label, value]) => <Link href="/review-queue" key={label}><span>{label}</span><strong>{value}</strong><small>{value ? "Needs operator review" : "No current signal"}</small></Link>)}
          </div>
        </section>
      </div>
      <div className="dashboard-side-stack">
        <aside className="urgent-card">
          <div className="soft-card-header"><span>Needs attention</span><strong>Urgent Items</strong></div>
          <div className="urgent-list">
            <Link href="/review-queue"><span>Ambiguous customer match</span><strong>{review.length}</strong></Link>
            <Link href="/pipeline?stage=Approved%20for%20SWO"><span>SWO approval waiting</span><strong>{awaiting.length}</strong></Link>
            <Link href="/calendar-mapping"><span>Failed Striven sync</span><strong>{syncIssues.length}</strong></Link>
            <Link href="/review-queue"><span>Duplicate work order risk</span><strong>{risks[0][1]}</strong></Link>
          </div>
          <div className="command-status apple"><span>{refreshedAt ? `Updated ${formatDate(refreshedAt)}` : "Not refreshed"}</span><em>{stale ? "Stale cache" : "Fresh cache"}</em></div>
        </aside>
        <section className="quick-control-card">
          <div className="soft-card-header"><span>Controls</span><strong>Live Operations</strong></div>
          <div className="command-controls apple">
            <button className="btn" type="button" onClick={syncStatuses} disabled={refreshing}>Sync Statuses</button>
            <Link className="btn" href="/pipeline">Pipeline Board</Link>
            <Link className="btn" href="/calendar-mapping">Calendar</Link>
            <Link className="btn" href="/admin">Backend Config</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function PipelineBoard({ rows, activeStage, runRowAction, runBulkAction, busyRowId }: { rows: IntakeRow[]; activeStage?: Stage; runRowAction: (row: IntakeRow, actionOverride?: string) => void; runBulkAction: (rows: IntakeRow[], action: string) => Promise<void>; busyRowId: string }) {
  const recentRows = sortRequestsRecentFirst(rows);
  const visibleStages = activeStage ? [activeStage] : stages;
  const visibleRows = visibleStages.flatMap((stage) => byStage(recentRows, stage).slice(0, activeStage ? 120 : 30));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedRows = visibleRows.filter((row) => selectedIds.includes(row.id));
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedIds.includes(row.id));
  const isBulkBusy = busyRowId === "bulk";

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => visibleRows.some((row) => row.id === id)));
  }, [activeStage, rows]);

  async function handleBulkAction(action: string) {
    await runBulkAction(selectedRows, action);
    setSelectedIds([]);
  }

  return (
    <div className="ops-flow">
      <div className="pipeline-toolbar"><div><strong>{activeStage ? `${activeStage} Focus` : "Kanban Pipeline"}</strong><span>{recentRows.length} visible work items · newest first</span></div></div>
      <div className="bulk-action-bar">
        <label>
          <input type="checkbox" checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? [] : visibleRows.map((row) => row.id))} disabled={!visibleRows.length || isBulkBusy} />
          <span>{allVisibleSelected ? "Clear visible" : "Select visible"}</span>
        </label>
        <strong>{selectedRows.length} selected</strong>
        <div>
          {bulkActions.map((item) => <button key={item.action} type="button" onClick={() => handleBulkAction(item.action)} disabled={!selectedRows.length || isBulkBusy}>{isBulkBusy ? "Working..." : item.label}</button>)}
        </div>
      </div>
      <div className="stage-filter-bar">
        <Link className={!activeStage ? "active" : ""} href="/pipeline">All</Link>
        {stages.map((stage) => <Link className={activeStage === stage ? "active" : ""} href={`/pipeline?stage=${encodeURIComponent(stage)}`} key={stage}>{stage}</Link>)}
      </div>
      <div className={`pipeline-board ${activeStage ? "is-focus" : ""}`}>
        {visibleStages.map((stage) => {
          const stageRows = byStage(recentRows, stage);
          return (
            <section className="pipeline-column" key={stage}>
              <header><div><span>{stage}</span><small>{stageHelp(stage)}</small></div><strong>{stageRows.length}</strong></header>
              <div>
                {stageRows.slice(0, activeStage ? 120 : 30).map((row) => (
                  <PipelineCard
                    row={row}
                    key={row.id}
                    runRowAction={runRowAction}
                    busy={busyRowId === row.id || isBulkBusy}
                    selected={selectedIds.includes(row.id)}
                    onToggleSelected={() => setSelectedIds((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                  />
                ))}
                {!stageRows.length ? <div className="pipeline-empty">No work in this lane.</div> : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function WorkItem({ row, taskRows, customerHistory, runRowAction, busy }: { row: IntakeRow; taskRows: TaskMappingRow[]; customerHistory?: CustomerHistorySummary; runRowAction: (row: IntakeRow, actionOverride?: string, extraPayload?: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  const next = nextActionFor(row);
  const relatedTask = findRelatedTask(row, taskRows);
  const lifecycle = buildServiceLifecycle(row, relatedTask);
  const installTag = deriveApplianceInstallTag(row, customerHistory);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  return (
    <>
      <section className="panel lifecycle-header"><WorkflowStageRail row={row} relatedTask={relatedTask} /></section>
      <div className="work-item-layout">
        <div className="work-main-stack">
          <section className="work-main panel">
            <div className="panel-header work-item-header">
              <div className="work-title"><h3><CustomerDisplay row={row} /></h3></div>
              <div className="work-header-actions">
                {installTag.key === "classic_install" ? <InstallProofCard tag={installTag} /> : null}
                <button className="btn report-btn" type="button" onClick={() => setReportOpen(true)}>Report</button>
                {reportMessage ? <small>{reportMessage}</small> : null}
              </div>
            </div>
            <div className="work-body">
              <div className="identity-grid work-contact-grid">
                <InfoGroup label="Contact">
                  <a href={phoneUrl(row.phone) || undefined}>{formatPhone(row.phone) || "No phone"}</a>
                  <a href={emailUrl(row.email) || undefined}>{formatEmail(row.email) || "No email"}</a>
                </InfoGroup>
                <InfoGroup label="Location" href={googleMapsUrl(row)}>
                  <strong>{formatAddressParts(row) || "No address"}</strong>
                  <small>{formatAddressParts(row) ? "Open in Google Maps" : "Location details missing"}</small>
                </InfoGroup>
                <InfoGroup label="Appliance">
                  <div className="info-title-row"><strong>{row.makeModelAge || "No appliance details"}</strong></div>
                  <small>Preferred: {row.preferredDays || "No preference"}</small>
                  {installTag.key === "customer_reported_install" ? <small className="install-source-note">Customer-entered install date. Not verified in Classic records.</small> : null}
                </InfoGroup>
                <InfoGroup label="Submitted"><strong>{formatDate(row.submittedAt)}</strong><small>Webform intake</small></InfoGroup>
              </div>
              <div className="service-summary"><span>Service Request</span><p>{row.details || "No details captured."}</p>{row.anythingElse ? <small>{row.anythingElse}</small> : null}</div>
              <div className="next-action-card">
                <div><span>Primary Next Action</span><strong>{next.label}</strong><p>{next.reason}</p></div>
                <div className="next-action-buttons">
                  <button className="btn primary" disabled={next.disabled || busy} onClick={() => runRowAction(row)}>{busy ? "Working..." : next.label}</button>
                  <button className="btn" disabled={busy} onClick={() => runRowAction(row, "repair_request")}>{busy ? "Repairing..." : "Repair"}</button>
                </div>
              </div>
            </div>
          </section>
          <section className="panel ai-bottom-panel">
            <div className="panel-header"><h3>Service Brief</h3></div>
            <AiSuggestionBox row={row} lifecycle={lifecycle} relatedTask={relatedTask} />
          </section>
        </div>
      </div>
      {reportOpen ? (
        <WorkItemReportDialog
          row={row}
          relatedTask={relatedTask}
          onClose={() => setReportOpen(false)}
          onRepair={async (issues, details) => runRowAction(row, "report_repair", { issues, details })}
          onSaved={(message) => {
            setReportMessage(message);
            setReportOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function WorkItemReportDialog({ row, relatedTask, onClose, onRepair, onSaved }: { row: IntakeRow; relatedTask?: TaskMappingRow; onClose: () => void; onRepair: (issues: string[], details: string) => Promise<void>; onSaved: (message: string) => void }) {
  const options = ["Select All", "Customer #", "Customer name", "Phone", "Email", "Address / location", "Opportunity #", "Opportunity status", "SO #", "SO status", "Task #", "Task status", "Schedule / technician", "Appliance details", "Service request details"];
  const [selected, setSelected] = useState<string[]>([]);
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function toggle(option: string) {
    setSelected((current) => {
      if (option === "Select All") return current.includes("Select All") ? [] : options;
      const next = current.includes(option) ? current.filter((item) => item !== option && item !== "Select All") : [...current, option];
      return options.filter((item) => item !== "Select All").every((item) => next.includes(item)) ? options : next;
    });
  }

  async function submitReport() {
    if (!selected.length || saving) return;
    setSaving(true);
    setError("");
    try {
      await onRepair(selected, details);
      onSaved("Selected mappings were cleared and re-checked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not repair selected mapping.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="report-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="report-dialog" role="dialog" aria-modal="true" aria-label="Report work item issue" onClick={(event) => event.stopPropagation()}>
        <header><div><span>Report Work Item</span><h3>What should be re-matched?</h3></div><button className="btn" type="button" onClick={onClose}>Close</button></header>
        <div className="report-context">
          <div><span>Customer</span><strong>{row.strivenCustomerId || "NEW"}</strong></div>
          <div><span>Opportunity</span><strong><InlineRecordLink type="opportunity" id={row.strivenOppId} accountId={row.strivenCustomerId} fallback={row.strivenOppId || "-"} /></strong></div>
          <div><span>Sales Order</span><strong><InlineRecordLink type="salesOrder" id={row.strivenSoId} fallback={row.salesOrderNumber || row.strivenSoId || "-"} /></strong></div>
          <div><span>Task</span><strong><InlineRecordLink type="task" id={relatedTask?.taskId} fallback={relatedTask?.taskId || "-"} /></strong></div>
        </div>
        <div className="report-option-grid">
          {options.map((option) => <label className={selected.includes(option) ? "selected" : ""} key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}
        </div>
        <label className="report-details"><span>Enter details if it is not listed above</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={4} placeholder="Example: Customer number is right, but SO belongs to a different address..." /></label>
        {error ? <div className="report-error">{error}</div> : null}
        <footer><button className="btn" type="button" onClick={onClose}>Cancel</button><button className="btn primary" type="button" onClick={submitReport} disabled={!selected.length || saving}>{saving ? "Repairing..." : "Clear and Re-check"}</button></footer>
      </section>
    </div>
  );
}

function ReviewDesk({ rows, runRowAction, busyRowId }: { rows: IntakeRow[]; runRowAction: (row: IntakeRow, actionOverride?: string) => void; busyRowId: string }) {
  return (
    <div className="review-desk">
      {!rows.length ? <div className="empty-workspace">No review blockers in the current scope.</div> : null}
      {sortRequestsRecentFirst(rows).map((row) => (
        <article className="review-ticket" key={row.id}>
          <div><span>{row.sourceRow > 0 ? `Row ${row.sourceRow}` : row.id}</span><h3><CustomerDisplay row={row} /></h3></div>
          <PipelinePill stage={stageFor(row)} />
          <p>{row.lastError || "Review required before continuing."}</p>
          <div className="review-actions">
            <Link className="btn" href={`/requests/${encodeURIComponent(row.id)}`} prefetch>Open</Link>
            <button className="btn primary" type="button" onClick={() => runRowAction(row)} disabled={busyRowId === row.id}>{busyRowId === row.id ? "Working..." : "Resolve"}</button>
            <button className="btn" type="button" onClick={() => runRowAction(row, "repair_request")} disabled={busyRowId === row.id}>Retry Step</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function CalendarMapping({ taskRows }: { taskRows: TaskMappingRow[] }) {
  const grouped = groupCalendarItemsByTech(taskRows);
  return (
    <div className="calendar-mapping-view">
      {grouped.map((group) => (
        <section className="calendar-tech-lane panel" key={group.tech}>
          <h4>{group.tech}</h4>
          <div>{group.items.map((row) => <EventCard row={row} key={row.eventId || `${row.soNumber}-${row.start}`} />)}</div>
        </section>
      ))}
      {!grouped.length ? <div className="empty-workspace">No task/calendar rows in this scope.</div> : null}
    </div>
  );
}

function AdminPanel({ data }: { data: LivePayload }) {
  const fields = ["STRIVEN_BASE_URL", "STRIVEN_CLIENT_ID", "STRIVEN_CLIENT_SECRET", "STRIVEN_OPPORTUNITY_TYPE_ID", "STRIVEN_OPPORTUNITY_CATEGORY_ID_WEBFORM", "STRIVEN_MARKETING_CONSENT_CF_ID", "SPREADSHEET_ID", "TEST_MODE", "SERVICEOPS_READ_ONLY", "STRIVEN_CUSTOMER_REPORT_API_KEY", "Striven_CustomerLocations_ReportAPI", "SERVICEOPS_CUSTOMER_ASSETS_REPORT_URL", "STRIVEN_SERVICE_WO_REPORT_API", "SERVICE_TASKS_REPORT_URL", "STRIVEN_OPPORTUNITY_REPORT_API_KEY", "CALENDAR_ALLOWED_ORGANIZER_DOMAIN"];
  return (
    <div className="admin-stack">
      <Panel title="System Readiness"><div className="readiness-card"><span>Phase 1 Foundation</span><strong>{data.error ? "Needs attention" : "Ready to check"}</strong><p>{data.error || "Run the check before processing live workflow steps."}</p></div></Panel>
      <Panel title="Backend Configuration">
        <div className="admin-form-actions"><button className="btn" type="button">Load Current Values</button><button className="btn primary" type="button">Save to .env.local</button></div>
        <div className="admin-config-grid">{fields.map((field) => <label key={field}><span>{field}</span><input className="input" placeholder="Enter server-side value" readOnly /></label>)}</div>
      </Panel>
    </div>
  );
}

function EventCard({ row }: { row: TaskMappingRow }) {
  return (
    <article className={`calendar-event-card ${eventTone(row)}`}>
      <div className="event-time"><strong>{timeOnly(row.start || "")}</strong><span>{row.end ? timeOnly(row.end) : ""}</span></div>
      <div className="event-body"><strong>{row.soNumber || row.title || "Unmapped event"}</strong><span>{row.taskName || row.title || "Service call"}</span><small>{row.location || "No location"} · {row.rowStatus || row.matchMethod || "No status"}</small></div>
    </article>
  );
}

function WorkListItem({ row }: { row: IntakeRow }) {
  return (
    <Link href={`/requests/${encodeURIComponent(row.id)}`} prefetch>
      <div><strong><CustomerDisplay row={row} /></strong><span>{row.city || "No city"} · {formatDate(row.submittedAt)} · {nextActionFor(row).label}</span></div>
      <PipelinePill stage={stageFor(row)} />
    </Link>
  );
}

function PipelineCard({ row, runRowAction, busy, selected = false, onToggleSelected }: { row: IntakeRow; runRowAction: (row: IntakeRow, actionOverride?: string) => void; busy: boolean; selected?: boolean; onToggleSelected?: () => void }) {
  const next = nextActionFor(row);
  return (
    <article className={`pipeline-card ${selected ? "selected" : ""}`}>
      {onToggleSelected ? <label className="pipeline-select" aria-label={`Select ${customerLabel(row)}`}><input type="checkbox" checked={selected} onChange={onToggleSelected} disabled={busy} /></label> : null}
      <Link href={`/requests/${encodeURIComponent(row.id)}`} prefetch>
        <div className="pipeline-card-top"><strong><CustomerDisplay row={row} /></strong>{row.needsReview || row.lastError ? <b>!</b> : null}</div>
        <span>{row.city || "No city"} · {formatPhone(row.phone) || "No phone"}</span>
        <p>{row.details || row.makeModelAge || "No details"}</p>
        <small>{formatDate(row.submittedAt)} · {serviceCategory(row)}</small>
      </Link>
      <div className="pipeline-card-foot"><button type="button" onClick={() => runRowAction(row)} disabled={next.disabled || busy}>{busy ? "Working..." : next.label}</button>{row.salesOrderNumber ? <em>{row.salesOrderNumber}</em> : null}</div>
    </article>
  );
}

function WorkflowStageRail({ row, relatedTask }: { row: IntakeRow; relatedTask?: TaskMappingRow }) {
  const steps = workFlowStepsFor(row, relatedTask);
  return (
    <div className="stage-rail flow-rail">
      {steps.map((stage) => (
        <div className={`stage-step flow-stage ${stage.state}`} key={stage.key}>
          <span className="flow-status-marker" aria-hidden="true" />
          <div><strong>{stage.label}</strong><small><InlineRecordLink type={stage.type} id={stage.id} accountId={row.strivenCustomerId} fallback={stage.value} /></small></div>
        </div>
      ))}
    </div>
  );
}

function AiSuggestionBox({ row, lifecycle, relatedTask }: { row: IntakeRow; lifecycle: ReturnType<typeof buildServiceLifecycle>; relatedTask?: TaskMappingRow }) {
  const suggestions = aiSuggestionsFor(row, lifecycle, relatedTask);
  const [open, setOpen] = useState<number[]>([0]);
  return (
    <div className="ai-suggestion-box">
      {suggestions.map((suggestion, index) => {
        const isOpen = open.includes(index);
        return (
          <article className={`ai-suggestion-card ${suggestion.tone} ${isOpen ? "open" : "closed"}`} key={suggestion.title}>
            <button type="button" className="ai-suggestion-trigger" aria-expanded={isOpen} onClick={() => setOpen((current) => current.includes(index) ? current.filter((item) => item !== index) : [...current, index])}>
              <span>{suggestion.label}</span><strong>{suggestion.title}</strong><em>{isOpen ? "Collapse" : "Expand"}</em>
            </button>
            {isOpen ? <dl><dt>Issue</dt><dd>{suggestion.issue}</dd><dt>Before booking</dt><dd>{suggestion.solution}</dd><dt>Technician prep</dt><dd>{suggestion.techPrep}</dd><dt>Parts to carry</dt><dd>{suggestion.parts}</dd></dl> : null}
          </article>
        );
      })}
    </div>
  );
}

function InfoGroup({ label, href, children }: { label: string; href?: string; children: ReactNode }) {
  const content = <><div className="info-copy"><span>{label}</span>{children}</div></>;
  return href ? <a className="info-cell info-group linked" href={href} target="_blank" rel="noreferrer">{content}</a> : <div className="info-cell info-group">{content}</div>;
}

function InstallProofCard({ tag }: { tag: ReturnType<typeof deriveApplianceInstallTag> }) {
  return (
    <div className="install-proof-card">
      <span>Installed by Classic</span>
      <strong>{formatInstallDate(tag.installedOn) || "Date unknown"}</strong>
      {tag.invoiceId ? <StrivenRecordLink type="invoice" id={tag.invoiceId} compact>Invoice {tag.invoiceId}</StrivenRecordLink> : <small>Invoice not found</small>}
    </div>
  );
}

function CustomerDisplay({ row }: { row: IntakeRow }) {
  const name = customerLabel(row);
  const id = row.strivenCustomerId ? `#${row.strivenCustomerId}` : "#NEW";
  if (row.strivenCustomerId) {
    return <StrivenRecordLink type="customer" id={row.strivenCustomerId} label={`Open ${name} in Striven`} compact>{id} - {name}</StrivenRecordLink>;
  }
  return <span className="customer-display new">{id} - {name}</span>;
}

function InlineRecordLink({ type, id, accountId, fallback }: { type?: StrivenRecordType; id?: unknown; accountId?: unknown; fallback: string }) {
  if (!type || !id || fallback === "-") return <>{fallback}</>;
  return <StrivenRecordLink type={type} id={id} accountId={accountId} label={`Open ${fallback} in Striven`} compact>{fallback}</StrivenRecordLink>;
}

function PipelinePill({ stage }: { stage: Stage }) {
  return <span className={`pipeline-pill ${stage.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{stage}</span>;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel"><div className="panel-header"><h3>{title}</h3></div>{children}</section>;
}

function DataHealth({ data }: { data: LivePayload }) {
  const tone = data.error ? "error" : data.stale ? "warn" : "ok";
  return <span className={`data-health ${tone}`}>{data.error ? "Data issue" : data.stale ? "Stale cache" : `${data.rows.length} requests`}</span>;
}

function normalizePayload(payload: LivePayload): LivePayload {
  return {
    ...payload,
    rows: dedupeIntakeForms(payload.rows || []),
    taskRows: payload.taskRows || [],
    customerHistory: payload.customerHistory || {},
    source: payload.source || "empty"
  };
}

function stageFromParam(value?: string): Stage | undefined {
  if (!value) return undefined;
  const normalized = decodeURIComponent(value).trim().toLowerCase();
  return stages.find((stage) => stage.toLowerCase() === normalized);
}

function byStage(rows: IntakeRow[], stage: Stage) {
  return rows.filter((row) => stageFor(row) === stage);
}

function stageFor(row: IntakeRow): Stage {
  if (row.needsReview || row.lastError || /REVIEW|ERROR|BLOCKED/i.test(row.pipelineState || "")) return "Review";
  const taskText = `${row.cleanServiceTaskStatus || ""} ${row.salesOrderStatus || ""}`;
  if (/complete|completed|closed|done/i.test(taskText)) return "Completed";
  if (row.salesOrderScheduledAt || /scheduled|in sync/i.test(taskText)) return "Scheduled";
  if (row.salesOrderNumber || row.strivenSoId || /SERVICE_SO_CREATED|WORK_ORDER/i.test(row.pipelineState || "")) return "Work Order Created";
  if (/Approved for SWO/i.test(row.opportunityStage || "")) return "Approved for SWO";
  if (row.strivenOppId || /OPPORTUNITY/i.test(row.pipelineState || "")) return "Opportunity";
  return "New Requests";
}

function actionNameFor(row: IntakeRow) {
  const stage = stageFor(row);
  if (stage === "Review") return "mark_reviewed";
  if (stage === "New Requests") return row.strivenCustomerId ? "create_opportunity" : "resolve_customer";
  if (stage === "Opportunity") return "check_opportunity_stage";
  if (stage === "Approved for SWO") return "create_sales_order";
  if (stage === "Work Order Created" || stage === "Scheduled") return "sync_statuses";
  return "";
}

function nextActionFor(row: IntakeRow) {
  const action = actionNameFor(row);
  if (action === "resolve_customer") return { label: "Resolve Customer", reason: "Match or create the customer before opportunity work.", disabled: false };
  if (action === "create_opportunity") return { label: "Create Opportunity", reason: "Customer is resolved; create the webform service opportunity.", disabled: false };
  if (action === "check_opportunity_stage") return { label: "Check Opportunity", reason: "Confirm approval before creating a service work order.", disabled: false };
  if (action === "create_sales_order") return { label: "Create Sales Order", reason: "Approved opportunity is ready for service work order creation.", disabled: false };
  if (action === "sync_statuses") return { label: "Map Schedule", reason: "Connect Striven task to technician calendar event.", disabled: false };
  if (action === "mark_reviewed") return { label: "Resolve Review", reason: row.lastError || "Review this work item before continuing.", disabled: false };
  return { label: "No Action", reason: "No active workflow action for this item.", disabled: true };
}

function actionLabelFor(action: string) {
  return bulkActions.find((item) => item.action === action)?.label || action.replace(/_/g, " ");
}

function workFlowStepsFor(row: IntakeRow, relatedTask?: TaskMappingRow): WorkFlowStep[] {
  const lifecycle = buildServiceLifecycle(row, relatedTask);
  const taskId = relatedTask?.taskId || "";
  const scheduledAt = relatedTask?.start || row.salesOrderScheduledAt || "";
  const stage = stageFor(row);
  const hasReviewBlocker = Boolean(row.needsReview || row.lastError);
  const hasCustomer = Boolean(row.strivenCustomerId);
  const hasOpportunity = Boolean(row.strivenOppId);
  const hasWorkOrder = Boolean(row.salesOrderNumber || row.strivenSoId);
  const hasTask = Boolean(taskId || relatedTask?.taskStatus || row.cleanServiceTaskStatus || row.taskMatched);
  const hasSchedule = Boolean(lifecycle.isScheduled || scheduledAt);
  const steps: WorkFlowStep[] = [
    { key: "webform", label: "Webform", value: formatDate(row.submittedAt) || "Received", helper: "Request received", state: "done" },
    { key: "customer", label: "Customer", value: hasCustomer ? `#${row.strivenCustomerId}` : "#NEW", helper: hasCustomer ? "Resolved" : "Match or create", state: hasCustomer ? "done" : "current", type: "customer", id: row.strivenCustomerId },
    { key: "opportunity", label: "Opportunity", value: hasOpportunity ? `#${row.strivenOppId}` : "-", helper: row.opportunityStage || "Not created", state: hasOpportunity ? stage === "Opportunity" ? "current" : "done" : hasCustomer ? "current" : "todo", type: "opportunity", id: row.strivenOppId },
    { key: "work-order", label: "Work Order", value: row.salesOrderNumber || row.strivenSoId || "-", helper: row.salesOrderStatus || "Not created", state: hasWorkOrder ? stage === "Work Order Created" ? "current" : "done" : hasOpportunity ? "current" : "todo", type: "salesOrder", id: row.strivenSoId },
    { key: "task", label: "Task", value: taskId ? `#${taskId}` : "-", helper: relatedTask?.taskStatus || row.cleanServiceTaskStatus || "No task", state: hasTask ? stage === "Scheduled" || stage === "Completed" ? "done" : "current" : hasWorkOrder ? "current" : "todo", type: "task", id: taskId },
    { key: "scheduled", label: "Scheduled on", value: scheduledAt ? formatDate(scheduledAt) : "-", helper: hasSchedule ? relatedTask?.tech || lifecycle.scheduleLabel || "Technician assigned" : "No date", state: hasSchedule ? lifecycle.isCompleted ? "done" : "current" : hasTask ? "current" : "todo" }
  ];
  const normalized = normalizeWorkflowStepStates(steps);
  return hasReviewBlocker ? normalized.map((step) => step.state === "current" ? { ...step, state: "blocked" } : step) : normalized;
}

function normalizeWorkflowStepStates(steps: WorkFlowStep[]) {
  let currentAssigned = false;
  return steps.map((step) => {
    if (step.state === "blocked" || step.state === "done") return step;
    if (!currentAssigned) {
      currentAssigned = true;
      return { ...step, state: "current" as const };
    }
    return { ...step, state: "todo" as const };
  });
}

function findRelatedTask(row: IntakeRow, taskRows: TaskMappingRow[]) {
  return taskRows.find((task) => task.soNumber && (task.soNumber === row.salesOrderNumber || task.soNumber === row.strivenSoId || row.salesOrderNumber?.includes(task.soNumber)));
}

function aiSuggestionsFor(row: IntakeRow, lifecycle: ReturnType<typeof buildServiceLifecycle>, relatedTask?: TaskMappingRow) {
  const text = `${row.details} ${row.makeModelAge}`.toLowerCase();
  const diagnosis = /pilot|ignite|ignition|flame|light/.test(text) ? "Ignition concern" : /fan|blower|noise|vibrat/.test(text) ? "Fan or noise issue" : "General service";
  return [
    { label: "Diagnosis", title: diagnosis, tone: "diagnosis", issue: row.details || "Customer submitted a service request.", solution: "Confirm exact symptom, appliance make/model, access constraints, and preferred days.", techPrep: `Review ${row.makeModelAge || "appliance details"}; prepare for diagnostic visit.`, parts: /pilot|ignite|ignition/.test(text) ? "Thermocouple, thermopile, pilot assembly, igniter, batteries/receiver." : "Standard service kit; issue-specific parts after diagnosis." },
    { label: "Scheduling", title: lifecycle.isScheduled ? "Appointment found" : "Find the technician appointment", tone: "schedule", issue: relatedTask?.rowStatus || "No mapped calendar event is confirmed.", solution: lifecycle.appointmentNote || "Use city and preferred days to pick the best route slot.", techPrep: "Keep appointment notes synced to the request after scheduling.", parts: "No parts impact unless diagnosis requires return trip." }
  ];
}

function scopedIntakeRows(rows: IntakeRow[], scope: ScopeKey) {
  if (scope === "all") return rows;
  const range = scopeRange(scope);
  return rows.filter((row) => withinRange(row.submittedAt, range));
}

function scopedTaskRows(rows: TaskMappingRow[], scope: ScopeKey) {
  if (scope === "all") return rows;
  const range = scopeRange(scope);
  return rows.filter((row) => withinRange(row.start || "", range));
}

function scopeRange(scope: ScopeKey) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  if (scope === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (scope === "last3") {
    start.setDate(start.getDate() - 2);
  } else if (scope === "last7") {
    start.setDate(start.getDate() - 6);
  } else if (scope === "thisMonth") {
    start.setDate(1);
  }
  return { start, end };
}

function withinRange(value: string, range: { start: Date; end: Date }) {
  const date = parseDate(value);
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

function scopeSummary(scope: ScopeKey) {
  const range = scopeRange(scope);
  if (scope === "all") return { label: "All Cached", value: "Every cached date" };
  if (scope === "today") return { label: "Today", value: formatScopeDate(range.start) };
  if (scope === "yesterday") return { label: "Yesterday", value: formatScopeDate(range.start) };
  if (scope === "last3") return { label: "Last 3 Days", value: `${formatScopeDate(range.start)} - ${formatScopeDate(range.end)}` };
  if (scope === "last7") return { label: "Last 7 Days", value: `${formatScopeDate(range.start)} - ${formatScopeDate(range.end)}` };
  return { label: "This Month", value: new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(new Date()) };
}

function parseDate(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string) {
  const date = parseDate(value || "");
  return date ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date) : "";
}

function formatInstallDate(value?: string) {
  const date = parseDate(value || "");
  return date ? new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(date) : "";
}

function formatScopeDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric" }).format(date);
}

function timeOnly(value: string) {
  const date = parseDate(value);
  return date ? new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(date) : "";
}

function titleFor(view: SimpleOpsView) {
  return view === "command" ? "Command Center" : view === "pipeline" ? "Pipeline Board" : view === "work-item" ? "Work Item" : view === "review" ? "Review Desk" : view === "calendar" ? "Calendar Mapping" : "Admin Console";
}

function subtitleFor(view: SimpleOpsView) {
  return view === "command" ? "The daily start point: volume, blockers, and next best work." : view === "pipeline" ? "A clean state-machine board for every live intake request." : view === "work-item" ? "One request, one primary next action, one service brief." : view === "review" ? "Human decisions separated from the happy path." : view === "calendar" ? "Task-to-calendar matching without clutter." : "Live data, config, and system health boundaries.";
}

function customerLabel(row: IntakeRow) {
  return formatName([row.firstName, row.lastName].filter(Boolean).join(" ")) || row.email || row.phone || "Unknown Customer";
}

function isReviewRow(row: IntakeRow) {
  return stageFor(row) === "Review";
}

function stageHelp(stage: Stage) {
  return stage === "New Requests" ? "Resolve customer" : stage === "Opportunity" ? "Create opportunities" : stage === "Approved for SWO" ? "Approval and checks" : stage === "Work Order Created" ? "Schedule next" : stage === "Scheduled" ? "Calendar mapped" : stage === "Completed" ? "Finished work" : "Needs decision";
}

function serviceCategory(row: IntakeRow) {
  const text = `${row.details} ${row.makeModelAge}`.toLowerCase();
  if (/pilot|ignite|ignition|flame/.test(text)) return "Ignition";
  if (/fan|blower|noise/.test(text)) return "Fan";
  if (/clean|maintenance|annual/.test(text)) return "Maintenance";
  return "Service";
}

function phoneUrl(value: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}

function emailUrl(value: string) {
  const email = formatEmail(value);
  return email ? `mailto:${email}` : "";
}

function googleMapsUrl(row: IntakeRow) {
  const address = formatAddressParts(row);
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : "";
}

function eventTone(row: TaskMappingRow) {
  if (/mismatch|missing|no task/i.test(row.rowStatus || "")) return "warn";
  if (/chris/i.test(row.tech)) return "green";
  if (/travis/i.test(row.tech)) return "maroon";
  return "olive";
}

function groupCalendarItemsByTech(rows: TaskMappingRow[]) {
  const groups = new Map<string, TaskMappingRow[]>();
  rows.forEach((row) => {
    const tech = row.tech || "Unassigned";
    groups.set(tech, [...(groups.get(tech) || []), row]);
  });
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tech, items]) => ({ tech, items: items.sort((a, b) => String(a.start || "").localeCompare(String(b.start || ""))) }));
}
