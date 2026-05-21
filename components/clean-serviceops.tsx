"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Boxes,
  Check,
  ChevronDown,
  Clock,
  EyeOff,
  FileText,
  Grip,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import type { IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";
import {
  buildUiRequests,
  canCreateWorkOrder,
  currentMonthRequests,
  currentMonthTasks,
  deriveNextAction,
  displayName,
  filterUiRequests,
  nextStatus,
  requestSummary,
  statusLabels,
  workOrderGate
} from "@/lib/serviceops/ui-model";
import type { LivePayload, OpsView, TimelineEntry, UiRequest, UiStatus } from "@/lib/serviceops/ui-model";

type State = {
  requests: UiRequest[];
  traces: TraceEntry[];
};

type Action =
  | { type: "advance"; id: string }
  | { type: "review-action"; id: string; label: "Fix" | "Retry" | "Override" }
  | { type: "match"; id: string; label: "Select Match" | "Create New Customer" }
  | { type: "agent-trace"; trace: TraceEntry };

type TraceEntry = {
  at: string;
  requestId: string;
  title: string;
  detail: string;
  kind: "tool" | "model" | "safety";
};

type WidgetSize = "small" | "medium" | "large";

type DeskWidget = {
  id: string;
  title: string;
  detail: string;
  value: string;
  tone: "blue" | "rose" | "green" | "yellow" | "teal" | "purple";
  size: WidgetSize;
  related: string[];
};

type ScriptProperty = {
  id: string;
  key: string;
  value: string;
  note: string;
  secret: boolean;
};

type ScheduleDay = {
  key: string;
  label: string;
  shortLabel: string;
  dayNumber: number;
  currentMonth: boolean;
  items: TaskMappingRow[];
};

export function CleanServiceOps({ view, requestId, initial }: { view: OpsView; requestId?: string; initial: LivePayload }) {
  const [state, dispatch] = useReducer(reducer, initial, initState);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<UiStatus | "all">("all");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<"week" | "month">("week");
  const [selectedDay, setSelectedDay] = useState<ScheduleDay | null>(null);
  const [widgets, setWidgets] = useState<DeskWidget[]>(() => readSavedWidgets(initial));
  const [scriptProperties, setScriptProperties] = useState<ScriptProperty[]>(() => defaultScriptProperties(initial));

  const scopedRequests = useMemo(() => currentMonthRequests(state.requests), [state.requests]);
  const scopedTasks = useMemo(() => currentMonthTasks(initial.taskRows), [initial.taskRows]);
  const filtered = useMemo(
    () => filterUiRequests(scopedRequests, { query, status, attentionOnly }),
    [attentionOnly, query, scopedRequests, status]
  );
  const selected = scopedRequests.find((row) => row.id === requestId) || scopedRequests[0];
  const updateWidgets: React.Dispatch<React.SetStateAction<DeskWidget[]>> = (value) => {
    setWidgets((current) => {
      const next = typeof value === "function"
        ? (value as (current: DeskWidget[]) => DeskWidget[])(current)
        : value;
      saveWidgets(next);
      return next;
    });
  };

  useEffect(() => {
    saveWidgets(widgets);
  }, [widgets]);

  return (
    <div className="control-desk">
      <ScopeBar payload={initial} requestCount={scopedRequests.length} taskCount={scopedTasks.length} />
      {view === "intake" ? (
        <IntakeQueue rows={filtered} query={query} setQuery={setQuery} status={status} setStatus={setStatus} attentionOnly={attentionOnly} setAttentionOnly={setAttentionOnly} dispatch={dispatch} />
      ) : null}
      {view === "command" ? <CommandCenter rows={scopedRequests} tasks={scopedTasks} dispatch={dispatch} widgets={widgets} setWidgets={updateWidgets} /> : null}
      {view === "customer-match" ? <CustomerMatch rows={filtered} dispatch={dispatch} /> : null}
      {view === "opportunity" ? <OpportunityDesk rows={scopedRequests} dispatch={dispatch} /> : null}
      {view === "work-orders" ? <WorkOrders rows={scopedRequests} dispatch={dispatch} /> : null}
      {view === "schedule" ? <ScheduleDesk rows={scopedTasks} mode={scheduleMode} setMode={setScheduleMode} selectedDay={selectedDay} setSelectedDay={setSelectedDay} /> : null}
      {view === "review" ? <ReviewDesk rows={scopedRequests.filter((row) => row.uiStatus === "attention")} dispatch={dispatch} /> : null}
      {view === "agent-logs" ? <AgentLogs traces={state.traces} rows={scopedRequests} /> : null}
      {view === "admin" ? <AdminDesk payload={initial} scriptProperties={scriptProperties} setScriptProperties={setScriptProperties} widgets={widgets} setWidgets={updateWidgets} /> : null}
      {view === "detail" && selected ? <RequestDetail row={selected} dispatch={dispatch} /> : null}
    </div>
  );
}

function initState(payload: LivePayload): State {
  const requests = buildUiRequests(payload.rows);
  return {
    requests,
    traces: requests.slice(0, 4).map((row) => ({
      at: row.submittedAt,
      requestId: row.id,
      title: "Request normalized",
      detail: `${displayName(row)} mapped to ${statusLabels[row.uiStatus]}.`,
      kind: "tool"
    }))
  };
}

function reducer(state: State, action: Action): State {
  if (action.type === "agent-trace") {
    return { ...state, traces: [action.trace, ...state.traces] };
  }

  return {
    ...state,
    requests: state.requests.map((row) => {
      if (row.id !== action.id) return row;
      const uiStatus = action.type === "advance" ? nextStatus(row.uiStatus) : "customer";
      const next = deriveNextAction(uiStatus);
      const text = action.type === "advance"
        ? `Simulated transition to ${statusLabels[uiStatus]}.`
        : `${action.label} simulated locally.`;
      return {
        ...row,
        uiStatus,
        nextAction: next.action,
        nextReason: next.reason,
        needsReview: uiStatus === "attention",
        timeline: [{ at: new Date().toISOString(), text }, ...row.timeline]
      };
    }),
    traces: [
      {
        at: new Date().toISOString(),
        requestId: action.id,
        title: action.type === "advance" ? "Local workflow transition" : action.label,
        detail: "No Striven write was called. This action updated local prototype state only.",
        kind: "safety"
      },
      ...state.traces
    ]
  };
}

function ScopeBar({ payload, requestCount, taskCount }: { payload: LivePayload; requestCount: number; taskCount: number }) {
  return (
    <section className="desk-scope">
      <span>This Month</span>
      <strong>{monthLabel()}</strong>
      <em>{requestCount} requests · {taskCount} schedule rows · {payload.source === "cache" ? "live cache" : payload.source}</em>
      <small>{payload.refreshedAt ? `Updated ${formatDate(payload.refreshedAt)}` : "No refresh timestamp"}</small>
      {payload.stale ? <b>Stale</b> : null}
    </section>
  );
}

function IntakeQueue(props: {
  rows: UiRequest[];
  query: string;
  setQuery: (value: string) => void;
  status: UiStatus | "all";
  setStatus: (value: UiStatus | "all") => void;
  attentionOnly: boolean;
  setAttentionOnly: (value: boolean) => void;
  dispatch: React.Dispatch<Action>;
}) {
  return (
    <section className="desk-page">
      <PageHeader
        eyebrow="Intake Queue"
        title="Newest webform intakes"
        subtitle="One row, one decision. Resolve identity, prepare the opportunity, or route blockers to review."
        action={<Link className="desk-primary" href="/customer-resolution">Customer Match</Link>}
      />
      <QueueFilters {...props} />
      <div className="queue-table" role="table" aria-label="Webform intake queue">
        <div className="queue-head" role="row">
          <span>Customer</span>
          <span>Contact</span>
          <span>Request</span>
          <span>Fireplace</span>
          <span>Suggestions</span>
          <span>Status</span>
          <span>Next</span>
        </div>
        {props.rows.map((row) => <QueueRow key={row.id} row={row} dispatch={props.dispatch} />)}
      </div>
      {!props.rows.length ? <EmptyState text="No requests match the current filters." /> : null}
    </section>
  );
}

function QueueFilters(props: {
  query: string;
  setQuery: (value: string) => void;
  status: UiStatus | "all";
  setStatus: (value: UiStatus | "all") => void;
  attentionOnly: boolean;
  setAttentionOnly: (value: boolean) => void;
}) {
  return (
    <div className="desk-filters">
      <label>
        <Search size={15} />
        <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} placeholder="Search name, phone, email, city, issue" />
      </label>
      <select value={props.status} onChange={(event) => props.setStatus(event.target.value as UiStatus | "all")}>
        <option value="all">All statuses</option>
        {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="button" className={props.attentionOnly ? "active" : ""} onClick={() => props.setAttentionOnly(!props.attentionOnly)}>
        Needs Review
      </button>
    </div>
  );
}

function QueueRow({ row, dispatch }: { row: UiRequest; dispatch: React.Dispatch<Action> }) {
  const suggestion = serviceSuggestion(row);
  return (
    <article className={`queue-row ${row.uiStatus}`} role="row">
      <Link className="queue-customer" href={`/requests/${encodeURIComponent(row.id)}`}>
        <strong>{displayName(row)}</strong>
        <span><MapPin size={13} /> {locationLine(row)}</span>
        <small>{formatDate(row.submittedAt)}</small>
      </Link>
      <div className="queue-contact">
        <span><b>Primary</b>{row.phone || "No phone"}</span>
        <span><b>Alt</b>{row.altPhone || "No alt phone"}</span>
        <span><b>Email</b>{row.email || "No email"}</span>
      </div>
      <div className="queue-request">
        <div className="request-tags">
          <span className={`complexity-dot ${row.complexityLevel.toLowerCase()}`}>{row.complexityLevel}</span>
          <span>{row.recommendedTech}</span>
        </div>
        <p>{requestSummary(row)}</p>
      </div>
      <div className="queue-fireplace">
        <strong>{fireplaceSummary(row)}</strong>
        <span>{ageSignal(row)}</span>
      </div>
      <div className="queue-suggestion">
        <strong>{suggestion.title}</strong>
        <span>{suggestion.detail}</span>
      </div>
      <div>
        <StatusPill status={row.uiStatus} />
        {row.reviewReason ? <small className="review-hint">{row.reviewReason}</small> : null}
      </div>
      <div className="queue-next">
        <strong>{row.nextAction}</strong>
        <button type="button" onClick={() => dispatch({ type: "advance", id: row.id })}>Simulate</button>
      </div>
    </article>
  );
}

function CommandCenter({ rows, tasks, dispatch, widgets, setWidgets }: { rows: UiRequest[]; tasks: TaskMappingRow[]; dispatch: React.Dispatch<Action>; widgets: DeskWidget[]; setWidgets: React.Dispatch<React.SetStateAction<DeskWidget[]>> }) {
  const review = rows.filter((row) => row.uiStatus === "attention");
  const ready = rows.filter((row) => row.uiStatus === "approved" || row.uiStatus === "ready");
  const nextBest = [
    ...review,
    ...rows.filter((row) => row.uiStatus === "new" || row.uiStatus === "reference"),
    ...rows.filter((row) => ["customer", "history", "intelligence", "techArea", "date"].includes(row.uiStatus)),
    ...rows.filter((row) => row.uiStatus === "opportunity" || row.uiStatus === "approval"),
    ...ready,
    ...rows.filter((row) => row.uiStatus === "workOrder")
  ].slice(0, 7);

  return (
    <section className="desk-page">
      <PageHeader eyebrow="Command Center" title="Work that needs control" subtitle="Compact view of blockers, ready work, schedule pressure, and the next safest actions." />
      <div className="metric-grid">
        <MetricCard label="Needs Review" value={review.length} tone="rose" href="/review-queue" />
        <MetricCard label="New Intake" value={count(rows, "new")} tone="blue" href="/requests" />
        <MetricCard label="Approved SWO" value={ready.length} tone="purple" href="/work-orders" />
        <MetricCard label="Scheduled" value={count(rows, "scheduled") + tasks.length} tone="green" href="/schedule" />
      </div>
      <WidgetBoard widgets={widgets} setWidgets={setWidgets} />
      <div className="desk-two-col">
        <Panel title="Next Best Work" icon={<Sparkles size={16} />}>
          {nextBest.map((row) => <MiniDecision key={row.id} row={row} dispatch={dispatch} />)}
        </Panel>
        <Panel title="Operational Risks" icon={<AlertTriangle size={16} />}>
          <RiskRow label="Ambiguous customer match" value={review.filter((row) => /identity|match/i.test(row.reviewReason)).length} />
          <RiskRow label="Missing location" value={rows.filter((row) => !row.street || !row.city).length} />
          <RiskRow label="SWO approval waiting" value={rows.filter((row) => row.uiStatus === "opportunity").length} />
          <RiskRow label="Duplicate/active job risk" value={review.filter((row) => /duplicate|active/i.test(row.reviewReason)).length} />
        </Panel>
      </div>
    </section>
  );
}

function CustomerMatch({ rows, dispatch }: { rows: UiRequest[]; dispatch: React.Dispatch<Action> }) {
  const candidates = rows.filter((row) => row.uiStatus === "new" || row.uiStatus === "attention").slice(0, 12);
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Customer Match" title="Resolve identity safely" subtitle="Strict priority: customer ID, phone, email, address. Uncertain matches stay manual." />
      <div className="match-list">
        {candidates.map((row, index) => {
          const score = matchScore(row, index);
          const needsReview = score < 75 || row.uiStatus === "attention";
          return (
            <article className="match-row" key={row.id}>
              <div>
                <StatusPill status={needsReview ? "attention" : "customer"} />
                <h3>{displayName(row)}</h3>
                <p>{locationLine(row)} · {requestSummary(row)}</p>
              </div>
              <div className="confidence-meter">
                <strong>{score}%</strong>
                <span>{matchReason(row)}</span>
              </div>
              <div className="match-actions">
                <button disabled={needsReview} onClick={() => dispatch({ type: "match", id: row.id, label: "Select Match" })}>Select Match</button>
                <button onClick={() => dispatch({ type: "match", id: row.id, label: "Create New Customer" })}>Create New</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function OpportunityDesk({ rows, dispatch }: { rows: UiRequest[]; dispatch: React.Dispatch<Action> }) {
  const opportunityRows = rows.filter((row) => ["date", "opportunity", "approval", "approved", "ready"].includes(row.uiStatus)).slice(0, 12);
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Opportunity" title="Prepare service opportunities" subtitle="Preview the payload, keep source as Web Form, and separate opportunity approval from work order creation." />
      <div className="payload-grid">
        {opportunityRows.map((row) => (
          <article className="payload-card" key={row.id}>
            <StatusPill status={row.uiStatus} />
            <h3>Webform: {displayName(row)} - {row.city || "No City"} - {row.phone || "No Phone"}</h3>
            <p>{requestSummary(row)}</p>
            <Checklist items={[
              { label: "Customer resolved", ok: !["new", "reference"].includes(row.uiStatus) },
              { label: "History and intelligence ready", ok: ["date", "opportunity", "approval", "approved", "ready"].includes(row.uiStatus) },
              { label: "Suggested tech/date included", ok: ["date", "opportunity", "approval", "approved", "ready"].includes(row.uiStatus) },
              { label: "Source = Web Form", ok: true },
              { label: "Service details included", ok: Boolean(row.details) },
              { label: "Approval checked before WO", ok: ["approval", "approved", "ready"].includes(row.uiStatus) }
            ]} />
            <button onClick={() => dispatch({ type: "advance", id: row.id })}>{row.nextAction}</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function WorkOrders({ rows, dispatch }: { rows: UiRequest[]; dispatch: React.Dispatch<Action> }) {
  const rowsForGate = rows.filter((row) => ["approved", "ready", "workOrder", "attention", "approval"].includes(row.uiStatus)).slice(0, 10);
  const current = rowsForGate[0];
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Work Orders" title="SWO approval gate" subtitle="Create work orders only when deterministic checks pass. Duplicate and active job risks block the button." />
      {current ? (
        <div className="gate-layout">
          <article className="gate-primary">
            <StatusPill status={current.uiStatus} />
            <h2>{displayName(current)}</h2>
            <p>{requestSummary(current)}</p>
            <Checklist items={workOrderGate(current)} />
            <button disabled={!canCreateWorkOrder(current)} onClick={() => dispatch({ type: "advance", id: current.id })}>Create Work Order</button>
          </article>
          <Panel title="Gate Queue" icon={<FileText size={16} />}>
            {rowsForGate.slice(1).map((row) => <MiniDecision key={row.id} row={row} dispatch={dispatch} />)}
          </Panel>
        </div>
      ) : <EmptyState text="No work order gate items this month." />}
    </section>
  );
}

function ReviewDesk({ rows, dispatch }: { rows: UiRequest[]; dispatch: React.Dispatch<Action> }) {
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Review" title="Manual decisions" subtitle="Newest blockers first. AI can explain, but humans approve identity conflicts and critical decisions." />
      <div className="review-grid-desk">
        {rows.map((row) => (
          <article className="review-card-desk" key={row.id}>
            <div>
              <StatusPill status="attention" />
              <span className="severity">{row.lastError ? "High" : "Medium"}</span>
            </div>
            <h3>{row.reviewReason || "Request needs review"}</h3>
            <p>{displayName(row)} · {requestSummary(row)}</p>
            <strong>{row.nextReason}</strong>
            <div className="desk-actions">
              <button onClick={() => dispatch({ type: "review-action", id: row.id, label: "Fix" })}>Fix</button>
              <button onClick={() => dispatch({ type: "review-action", id: row.id, label: "Retry" })}>Retry</button>
              <button onClick={() => dispatch({ type: "review-action", id: row.id, label: "Override" })}>Override</button>
            </div>
          </article>
        ))}
      </div>
      {!rows.length ? <EmptyState text="No manual review items this month." /> : null}
    </section>
  );
}

function ScheduleDesk({ rows, mode, setMode, selectedDay, setSelectedDay }: { rows: TaskMappingRow[]; mode: "week" | "month"; setMode: (mode: "week" | "month") => void; selectedDay: ScheduleDay | null; setSelectedDay: (day: ScheduleDay | null) => void }) {
  const [hovered, setHovered] = useState<string>("");
  const days = mode === "week" ? buildWeek(rows) : buildMonth(rows);
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Schedule" title="Technician schedule" subtitle="Group by day and technician. Hover a week day to expand it; click any day for a detailed popup." action={<Segmented value={mode} setValue={setMode} />} />
      <div className={mode === "week" ? "schedule-week-desk" : "schedule-month-desk"}>
        {days.map((day) => mode === "week" ? (
          <section className={hovered && hovered !== day.key ? "quiet" : hovered === day.key ? "active" : ""} key={day.key} onMouseEnter={() => setHovered(day.key)} onMouseLeave={() => setHovered("")} onClick={() => setSelectedDay(day)}>
            <header><strong>{day.shortLabel}</strong><span>{day.items.length}</span></header>
            <ScheduleBody items={day.items} />
          </section>
        ) : (
          <button className={day.currentMonth ? "" : "muted"} key={day.key} onClick={() => setSelectedDay(day)}>
            <span>{day.dayNumber}</span>
            <strong>{day.items.length}</strong>
            <small>{day.items[0]?.tech || "No work"}</small>
          </button>
        ))}
      </div>
      {selectedDay ? <DayModal day={selectedDay} close={() => setSelectedDay(null)} /> : null}
    </section>
  );
}

function RequestDetail({ row, dispatch }: { row: UiRequest; dispatch: React.Dispatch<Action> }) {
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Request Detail" title={displayName(row)} subtitle={`${locationLine(row)} · ${formatDate(row.submittedAt)}`} action={<button className="desk-primary" onClick={() => dispatch({ type: "advance", id: row.id })}>{row.nextAction}</button>} />
      <div className="detail-grid-desk">
        <article className="detail-main">
          <StatusPill status={row.uiStatus} />
          <h2>{requestSummary(row)}</h2>
          <p>{row.anythingElse || "No additional notes captured."}</p>
          <div className="field-grid-desk">
            <Field label="Phone" value={row.phone || "-"} />
            <Field label="Email" value={row.email || "-"} />
            <Field label="Preferred Days" value={row.preferredDays || "-"} />
            <Field label="Make / Model / Age" value={row.makeModelAge || "-"} />
          </div>
        </article>
        <aside className="detail-side">
          <h3>What is needed</h3>
          <Checklist items={[
            { label: "Customer identity resolved", ok: row.uiStatus !== "new" },
            { label: "Location captured", ok: Boolean(row.street && row.city) },
            { label: "Opportunity separated from WO", ok: true },
            { label: "No blocker", ok: row.uiStatus !== "attention" }
          ]} />
          <button onClick={() => dispatch({ type: "advance", id: row.id })}>{row.nextAction}</button>
        </aside>
      </div>
      <div className="detail-disclosures">
        <Disclosure title="Timeline"><Timeline entries={row.timeline} /></Disclosure>
        <Disclosure title="System Data"><SystemData row={row} /></Disclosure>
      </div>
    </section>
  );
}

function AgentLogs({ traces, rows }: { traces: TraceEntry[]; rows: UiRequest[] }) {
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Agent Logs" title="Assistant trace" subtitle="Structured progress, model/tool notes, and safety decisions. No secrets are shown." />
      <div className="trace-list">
        {traces.map((trace, index) => (
          <article key={`${trace.at}-${index}`}>
            <span className={trace.kind}>{trace.kind}</span>
            <div>
              <strong>{trace.title}</strong>
              <p>{trace.detail}</p>
              <small>{formatDate(trace.at)} · {rows.find((row) => row.id === trace.requestId) ? displayName(rows.find((row) => row.id === trace.requestId)!) : trace.requestId}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function AdminDesk({ payload, scriptProperties, setScriptProperties, widgets, setWidgets }: { payload: LivePayload; scriptProperties: ScriptProperty[]; setScriptProperties: React.Dispatch<React.SetStateAction<ScriptProperty[]>>; widgets: DeskWidget[]; setWidgets: React.Dispatch<React.SetStateAction<DeskWidget[]>> }) {
  return (
    <section className="desk-page">
      <PageHeader eyebrow="Admin" title="System settings" subtitle="Minimal controls first. Technical values stay collapsed and secrets are never rendered." />
      <div className="admin-grid-desk">
        <SettingCard label="Data Source" value={payload.source === "cache" ? "Live Cache" : payload.source} detail={payload.refreshedAt ? `Last refresh ${formatDate(payload.refreshedAt)}` : "No timestamp available"} />
        <SettingCard label="System Health" value={payload.stale ? "Stale" : "Healthy"} detail={payload.error || "No visible cache error"} />
        <SettingCard label="TEST_MODE" value="Simulated writes" detail="UI actions append local timeline entries only." />
        <SettingCard label="OpenAI" value="Assistant-only" detail="AI recommends and explains. It does not approve critical decisions." />
      </div>
      <ScriptPropertiesPanel properties={scriptProperties} setProperties={setScriptProperties} />
      <WidgetBoard widgets={widgets} setWidgets={setWidgets} />
      <WidgetLibrary widgets={widgets} setWidgets={setWidgets} />
      <Disclosure title="Collapsed Integration Notes">
        <p className="muted-copy">Future real writes should use deterministic gates for customer, opportunity, work order, schedule, and task mutations. API keys remain server-side only.</p>
      </Disclosure>
    </section>
  );
}

function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <header className="desk-header">
      <div>
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="desk-panel">
      <header>{icon}<h2>{title}</h2></header>
      <div>{children}</div>
    </section>
  );
}

function WidgetBoard({ widgets, setWidgets }: { widgets: DeskWidget[]; setWidgets: React.Dispatch<React.SetStateAction<DeskWidget[]>> }) {
  function updateWidget(id: string, patch: Partial<DeskWidget>) {
    setWidgets((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  return (
    <section className="widget-board">
      <header>
        <div>
          <span>Custom Blocks</span>
          <h2>Resizable widgets</h2>
        </div>
        <button type="button" onClick={() => setWidgets((current) => [...current, makeWidget("Custom Widget", "Track a custom operating signal.", "0", "yellow")])}>
          <Plus size={14} />
          Add Widget
        </button>
      </header>
      <div className="widget-grid">
        {widgets.map((widget) => (
          <article className={`desk-widget ${widget.tone} ${widget.size}`} key={widget.id}>
            <div className="widget-edit-band">
              <Grip size={14} />
              <input className="widget-title-edit" value={widget.title} onChange={(event) => updateWidget(widget.id, { title: event.target.value })} aria-label="Widget title" />
              <input className="widget-value-edit" value={widget.value} onChange={(event) => updateWidget(widget.id, { value: event.target.value })} aria-label="Widget value" />
              <select value={widget.tone} onChange={(event) => updateWidget(widget.id, { tone: event.target.value as DeskWidget["tone"] })} aria-label="Widget colour">
                <option value="blue">Blue</option>
                <option value="rose">Rose</option>
                <option value="green">Green</option>
                <option value="yellow">Yellow</option>
                <option value="teal">Teal</option>
                <option value="purple">Purple</option>
              </select>
              <button type="button" title="Hide widget" onClick={() => setWidgets((current) => current.filter((item) => item.id !== widget.id))}><EyeOff size={13} /></button>
            </div>
            <strong>{widget.value}</strong>
            <textarea className="widget-detail-edit" value={widget.detail} onChange={(event) => updateWidget(widget.id, { detail: event.target.value })} aria-label="Widget detail" />
            <div className="widget-related">
              {widget.related.map((item) => <span key={item}>{item}</span>)}
            </div>
            <div className="widget-size-control">
              {(["small", "medium", "large"] as const).map((size) => (
                <button
                  className={widget.size === size ? "active" : ""}
                  key={size}
                  type="button"
                  onClick={() => setWidgets((current) => current.map((item) => item.id === widget.id ? { ...item, size } : item))}
                >
                  {size}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WidgetLibrary({ widgets, setWidgets }: { widgets: DeskWidget[]; setWidgets: React.Dispatch<React.SetStateAction<DeskWidget[]>> }) {
  const related = [
    makeWidget("Custom Blank", "Editable blank block for any operating metric.", "0", "yellow", ["Custom"]),
    makeWidget("Identity Risk", "Customer matches that need careful review.", "Review", "rose", ["Customer Match", "Review"]),
    makeWidget("SWO Gate", "Work orders waiting for deterministic gate checks.", "Gate", "purple", ["Opportunity", "Work Orders"]),
    makeWidget("Route Density", "Technician clustering and schedule pressure.", "Map", "teal", ["Schedule", "Tasks"]),
    makeWidget("AI Queue", "Assistant-only summaries and recommendation traces.", "AI", "blue", ["Agent Logs", "OpenAI"]),
    makeWidget("Callback List", "Customers who need office follow-up.", "Calls", "green", ["Intake", "Customer"]),
    makeWidget("Stale Cache", "Refresh or sync freshness signal.", "Sync", "rose", ["Admin", "Cache"]),
    makeWidget("Technician Load", "Daily capacity and assignment balance.", "Techs", "teal", ["Schedule", "Work Orders"])
  ];

  return (
    <section className="widget-library">
      <header>
        <div>
          <span>Widget Templates</span>
          <h2>Add to active widgets</h2>
        </div>
      </header>
      <div>
        {related.map((widget) => (
          <button
            key={widget.title}
            type="button"
            onClick={() => setWidgets((current) => [...current, { ...widget, id: `${widget.id}-${Date.now()}` }])}
            disabled={widget.title !== "Custom Blank" && widgets.some((item) => item.title === widget.title)}
          >
            <Boxes size={15} />
            <strong>{widget.title}</strong>
            <span>{widget.detail}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScriptPropertiesPanel({ properties, setProperties }: { properties: ScriptProperty[]; setProperties: React.Dispatch<React.SetStateAction<ScriptProperty[]>> }) {
  function update(id: string, patch: Partial<ScriptProperty>) {
    setProperties((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  return (
    <section className="script-properties-panel">
      <header>
        <div>
          <span>Apps Script Style</span>
          <h2>Script Properties</h2>
          <p>Local configuration mock. Values entered here are not written to `.env.local` or sent to the browser as secrets.</p>
        </div>
        <button type="button" onClick={() => setProperties((current) => [...current, { id: `prop-${Date.now()}`, key: "NEW_PROPERTY", value: "", note: "Local mock value", secret: true }])}>
          <Plus size={14} />
          Add Property
        </button>
      </header>
      <div className="script-properties-table">
        <div className="script-properties-head">
          <span>Property</span>
          <span>Value</span>
          <span>Note</span>
          <span>Secret</span>
          <span></span>
        </div>
        {properties.map((property) => (
          <div className="script-property-row" key={property.id}>
            <input value={property.key} onChange={(event) => update(property.id, { key: event.target.value })} aria-label="Property key" />
            <input value={property.secret ? maskValue(property.value) : property.value} onChange={(event) => update(property.id, { value: event.target.value })} aria-label="Property value" />
            <input value={property.note} onChange={(event) => update(property.id, { note: event.target.value })} aria-label="Property note" />
            <button className={property.secret ? "active" : ""} type="button" onClick={() => update(property.id, { secret: !property.secret })}>{property.secret ? "Yes" : "No"}</button>
            <button type="button" onClick={() => setProperties((current) => current.filter((item) => item.id !== property.id))} aria-label="Delete property"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetricCard({ label, value, tone, href }: { label: string; value: number; tone: string; href: string }) {
  return <Link className={`metric-card-desk ${tone}`} href={href}><span>{label}</span><strong>{value}</strong></Link>;
}

function MiniDecision({ row, dispatch }: { row: UiRequest; dispatch: React.Dispatch<Action> }) {
  return (
    <article className="mini-decision">
      <Link href={`/requests/${encodeURIComponent(row.id)}`}>
        <StatusPill status={row.uiStatus} />
        <strong>{displayName(row)}</strong>
        <span>{row.nextAction} · {formatDate(row.submittedAt)}</span>
      </Link>
      <button onClick={() => dispatch({ type: "advance", id: row.id })}>Simulate</button>
    </article>
  );
}

function RiskRow({ label, value }: { label: string; value: number }) {
  return <div className="risk-row"><span>{label}</span><strong>{value}</strong></div>;
}

function StatusPill({ status }: { status: UiStatus }) {
  return <span className={`status-pill-desk ${status}`}>{statusLabels[status]}</span>;
}

function Checklist({ items }: { items: Array<{ label: string; ok: boolean }> }) {
  return (
    <div className="checklist-desk">
      {items.map((item) => (
        <div className={item.ok ? "ok" : ""} key={item.label}>
          <span>{item.ok ? <Check size={14} /> : <X size={14} />}</span>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

function ScheduleBody({ items }: { items: TaskMappingRow[] }) {
  const groups = groupByTech(items);
  if (!groups.length) return <p className="empty-soft">No scheduled work</p>;
  return (
    <div className="schedule-body-desk">
      {groups.map((group) => (
        <div key={group.tech}>
          <h4>{group.tech}</h4>
          {group.items.map((item) => <ScheduleEvent key={item.eventId || `${item.soNumber}-${item.start}`} item={item} />)}
        </div>
      ))}
    </div>
  );
}

function ScheduleEvent({ item }: { item: TaskMappingRow }) {
  return (
    <article className={`schedule-event-desk ${scheduleTone(item)}`}>
      <strong>{timeOnly(item.start || "")}</strong>
      <span>{item.soNumber || item.title || "Service"}</span>
      <small>{item.location || "No location"} · {item.rowStatus || "Scheduled"}</small>
    </article>
  );
}

function DayModal({ day, close }: { day: ScheduleDay; close: () => void }) {
  return (
    <div className="desk-modal-backdrop" onClick={close}>
      <section className="desk-day-modal" onClick={(event) => event.stopPropagation()}>
        <header><div><span>Daily Schedule</span><h2>{day.label}</h2></div><button onClick={close}>Close</button></header>
        <ScheduleBody items={day.items} />
      </section>
    </div>
  );
}

function Segmented({ value, setValue }: { value: "week" | "month"; setValue: (value: "week" | "month") => void }) {
  return <div className="desk-segmented"><button className={value === "week" ? "active" : ""} onClick={() => setValue("week")}>Week</button><button className={value === "month" ? "active" : ""} onClick={() => setValue("month")}>Month</button></div>;
}

function Disclosure({ title, children }: { title: string; children: React.ReactNode }) {
  return <details className="desk-disclosure"><summary>{title}<ChevronDown size={15} /></summary>{children}</details>;
}

function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return <div className="timeline-desk">{entries.map((entry, index) => <div key={`${entry.at}-${index}`}><Clock size={14} /><span>{formatDate(entry.at)}</span><strong>{entry.text}</strong></div>)}</div>;
}

function SystemData({ row }: { row: UiRequest }) {
  return <div className="system-data-desk"><code>Customer: {row.strivenCustomerId || "-"}</code><code>Opportunity: {row.strivenOppId || "-"}</code><code>Work Order: {row.salesOrderNumber || row.strivenSoId || "-"}</code><code>Pipeline: {row.pipelineState || "-"}</code></div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function SettingCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="setting-card-desk"><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state-desk">{text}</div>;
}

function count(rows: UiRequest[], status: UiStatus) {
  return rows.filter((row) => row.uiStatus === status).length;
}

function defaultWidgets(payload: LivePayload): DeskWidget[] {
  const requests = buildUiRequests(payload.rows);
  const review = requests.filter((row) => row.uiStatus === "attention").length;
  const ready = requests.filter((row) => row.uiStatus === "approved" || row.uiStatus === "ready").length;
  return [
    makeWidget("Live Intake", "Newest webform requests in the cache.", String(requests.length), "blue", ["Intake Queue", "Cache"], "medium"),
    makeWidget("Needs Review", "Identity, duplicate, or missing-data blockers.", String(review), "rose", ["Review", "Customer Match"], "small"),
    makeWidget("Approved for SWO", "Requests that can enter the SWO gate.", String(ready), "purple", ["Opportunity", "Work Orders"], "small")
  ];
}

function readSavedWidgets(payload: LivePayload): DeskWidget[] {
  if (typeof window === "undefined") return defaultWidgets(payload);
  try {
    const raw = window.localStorage.getItem("serviceops-widgets");
    if (!raw) return defaultWidgets(payload);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const normalized = parsed.filter(isWidgetLike).map(normalizeWidget);
      if (normalized.length > 0) return normalized;
    }
  } catch {
    return defaultWidgets(payload);
  }
  return defaultWidgets(payload);
}

function saveWidgets(widgets: DeskWidget[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("serviceops-widgets", JSON.stringify(widgets.map(normalizeWidget)));
}

function isWidgetLike(value: unknown): value is Partial<DeskWidget> {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DeskWidget>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.detail === "string" &&
    typeof item.value === "string"
  );
}

function normalizeWidget(widget: Partial<DeskWidget>): DeskWidget {
  return {
    id: widget.id || `widget-${Date.now()}`,
    title: widget.title || "Custom Widget",
    detail: widget.detail || "",
    value: widget.value || "0",
    tone: isWidgetTone(widget.tone) ? widget.tone : "yellow",
    size: isWidgetSize(widget.size) ? widget.size : "small",
    related: Array.isArray(widget.related) ? widget.related.map(String).filter(Boolean) : ["Custom"]
  };
}

function isWidgetTone(value: unknown): value is DeskWidget["tone"] {
  return value === "blue" || value === "rose" || value === "green" || value === "yellow" || value === "teal" || value === "purple";
}

function isWidgetSize(value: unknown): value is WidgetSize {
  return value === "small" || value === "medium" || value === "large";
}

function makeWidget(title: string, detail: string, value: string, tone: DeskWidget["tone"], related: string[] = ["Custom"], size: WidgetSize = "small"): DeskWidget {
  return {
    id: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    detail,
    value,
    tone,
    related,
    size
  };
}

function defaultScriptProperties(payload: LivePayload): ScriptProperty[] {
  return [
    { id: "test-mode", key: "TEST_MODE", value: "true", note: "UI writes are simulated in this phase.", secret: false },
    { id: "striven-base-url", key: "STRIVEN_BASE_URL", value: "https://api.striven.com", note: "Server-side integration base URL.", secret: false },
    { id: "openai-api-key", key: "OPENAI_API_KEY", value: "configured-server-side", note: "Assistant-only model calls. Do not expose.", secret: true },
    { id: "cache-source", key: "SERVICEOPS_CACHE_SOURCE", value: payload.source, note: "Current visible read source.", secret: false }
  ];
}

function maskValue(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 2)}••••${value.slice(-2)}`;
}

function readSavedFontScale() {
  if (typeof window === "undefined") return 1;
  const saved = Number(window.localStorage.getItem("serviceops-font-scale"));
  if (!Number.isFinite(saved)) return 1;
  return Math.min(1.3, Math.max(0.9, saved));
}

function locationLine(row: IntakeRow) {
  return [row.city, row.province, row.postalCode].filter(Boolean).join(", ") || "No location";
}

function matchScore(row: UiRequest, index: number) {
  if (row.uiStatus === "attention") return 58;
  if (row.phone && row.email) return Math.max(72, 94 - index * 3);
  if (row.phone || row.email) return Math.max(66, 84 - index * 4);
  return 62;
}

function matchReason(row: UiRequest) {
  if (row.phone && row.email) return "Phone and email available";
  if (row.phone) return "Phone available";
  if (row.email) return "Email available";
  return "Address fallback only";
}

function fireplaceSummary(row: UiRequest) {
  const value = row.makeModelAge?.trim();
  if (!value) return "Make/model not provided";
  return value.replace(/\s+/g, " ");
}

function ageSignal(row: UiRequest) {
  const text = row.makeModelAge || "";
  const ageMatch = text.match(/(\d{1,2})\s*(?:years?|yrs?|yr|old)/i);
  if (!ageMatch) return "Age unknown";
  const years = Number(ageMatch[1]);
  if (!Number.isFinite(years)) return "Age unknown";
  if (years >= 15) return `${years} years old · inspect wear parts`;
  if (years >= 8) return `${years} years old · service history useful`;
  return `${years} years old`;
}

function serviceSuggestion(row: UiRequest) {
  const text = `${row.details} ${row.anythingElse} ${row.makeModelAge}`.toLowerCase();
  if (/pilot|ignite|ignit|spark|flame|light/.test(text)) {
    return {
      title: "Ignition path",
      detail: "Check pilot assembly, thermocouple/thermopile, igniter, gas supply, and remote batteries."
    };
  }
  if (/glass|clean|soot|smell|odor|dust|maintenance|service/.test(text)) {
    return {
      title: "Maintenance kit",
      detail: "Likely cleaning/service visit; bring glass cleaner, gasket check, ember material, and inspection tools."
    };
  }
  if (/remote|battery|receiver|switch|wall/.test(text)) {
    return {
      title: "Control issue",
      detail: "Check remote, receiver, wall switch wiring, battery pack, and control module before parts."
    };
  }
  if (/fan|blower|noise|sound|rattle/.test(text)) {
    return {
      title: "Fan/blower check",
      detail: "Inspect blower, bearings, wiring, dust buildup, and vibration points."
    };
  }
  if (row.complexityLevel === "L1") {
    return {
      title: "Complex diagnosis",
      detail: "Route to Travis; confirm model/serial, symptoms, safety language, and previous service history."
    };
  }
  return {
    title: "Standard triage",
    detail: "Confirm fireplace make/model, serial number, access, preferred day, and recent service history."
  };
}

function buildWeek(rows: TaskMappingRow[]): ScheduleDay[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return scheduleDay(date, rows);
  });
}

function buildMonth(rows: TaskMappingRow[]): ScheduleDay[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }).map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { ...scheduleDay(date, rows), currentMonth: date.getMonth() === now.getMonth() };
  });
}

function scheduleDay(date: Date, rows: TaskMappingRow[]): ScheduleDay {
  const key = localDateKey(date);
  return {
    key,
    label: new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric" }).format(date),
    shortLabel: new Intl.DateTimeFormat("en-CA", { weekday: "short", day: "numeric" }).format(date),
    dayNumber: date.getDate(),
    currentMonth: true,
    items: rows.filter((row) => (row.start || "").slice(0, 10) === key).sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")))
  };
}

function groupByTech(items: TaskMappingRow[]) {
  const preferred = ["Travis", "Chris", "Matt", "Matt Thompson"];
  const groups = new Map<string, TaskMappingRow[]>();
  for (const item of items) {
    const tech = normalizeTech(item.tech);
    groups.set(tech, [...(groups.get(tech) || []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (preferred.indexOf(a) === -1 ? 99 : preferred.indexOf(a)) - (preferred.indexOf(b) === -1 ? 99 : preferred.indexOf(b)) || a.localeCompare(b))
    .map(([tech, groupItems]) => ({ tech, items: groupItems }));
}

function normalizeTech(value: string) {
  if (/matt/i.test(value || "")) return "Matt";
  if (/chris/i.test(value || "")) return "Chris";
  if (/travis/i.test(value || "")) return "Travis";
  return value || "Unassigned";
}

function scheduleTone(row: TaskMappingRow) {
  if (/mismatch|missing|no task/i.test(row.rowStatus || "")) return "attention";
  if (/travis/i.test(row.tech || "")) return "purple";
  if (/chris/i.test(row.tech || "")) return "blue";
  if (/matt/i.test(row.tech || "")) return "green";
  return "teal";
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel() {
  return new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(new Date());
}

function formatDate(value?: string) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return value || "Unknown";
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(date);
}

function timeOnly(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit" }).format(date);
}
