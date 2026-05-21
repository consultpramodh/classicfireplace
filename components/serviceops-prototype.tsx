"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { calendarEvents, configValues, demoRequests, opportunityCustomFields, preferredDaysMap, strivenTasks } from "@/lib/demo-data";
import { appendAudit, evaluateSwoGate, pipelineStates, simulateTransition, stateLabels } from "@/lib/pipeline";
import type { PipelineState, ServiceRequest } from "@/lib/types";
import { ConfigCard } from "@/components/config-card";
import { DataTable } from "@/components/data-table";
import { EligibilityChecklist } from "@/components/eligibility-checklist";
import { KpiCard } from "@/components/kpi-card";
import { RequestDetailPanel } from "@/components/request-detail-panel";
import { ReviewCard } from "@/components/review-card";
import { StatusBadge } from "@/components/status-badge";

type View = "dashboard" | "intake" | "detail" | "customer" | "opportunity" | "swo" | "tasks" | "review" | "admin";

export function ServiceOpsPrototype({ view, requestId }: { view: View; requestId?: string }) {
  const [requests, setRequests] = useState(demoRequests);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"ALL" | PipelineState>("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const selected = requests.find((request) => request.id === requestId) ?? requests[0];

  const filtered = useMemo(() => {
    return requests.filter((request) => {
      const q = `${request.id} ${request.customerName} ${request.email} ${request.phone} ${request.city} ${request.serviceDetails}`.toLowerCase();
      return (!search || q.includes(search.toLowerCase())) && (stateFilter === "ALL" || request.state === stateFilter) && (!reviewOnly || request.reviewIssues.length > 0 || request.state === "REVIEW_REQUIRED" || request.state === "ERROR");
    });
  }, [requests, reviewOnly, search, stateFilter]);

  function act(requestIdToUpdate: string, action: string) {
    setRequests((current) =>
      current.map((request) => {
        if (request.id !== requestIdToUpdate) return request;
        const nextState = simulateTransition(request.state, action);
        return appendAudit(request, action, `Local prototype simulated ${action}. No API call was made.`, nextState);
      })
    );
  }

  return (
    <div className="prototype-page">
      <Header view={view} />
      {view === "dashboard" ? <Dashboard requests={requests} /> : null}
      {view === "intake" ? <Intake requests={filtered} search={search} setSearch={setSearch} stateFilter={stateFilter} setStateFilter={setStateFilter} reviewOnly={reviewOnly} setReviewOnly={setReviewOnly} /> : null}
      {view === "detail" ? <RequestDetailPanel request={selected} onAction={(action) => act(selected.id, action)} /> : null}
      {view === "customer" ? <CustomerResolution request={selected} /> : null}
      {view === "opportunity" ? <OpportunityView request={selected} /> : null}
      {view === "swo" ? <SwoGate request={selected} onCreate={() => act(selected.id, "createSwo")} /> : null}
      {view === "tasks" ? <TaskMapping /> : null}
      {view === "review" ? <ReviewQueue requests={requests.filter((request) => request.state === "REVIEW_REQUIRED" || request.state === "ERROR" || request.reviewIssues.length)} onAction={(id, action) => act(id, action)} /> : null}
      {view === "admin" ? <Admin /> : null}
    </div>
  );
}

function Header({ view }: { view: View }) {
  const titles: Record<View, string> = {
    dashboard: "ServiceOps Control Center",
    intake: "Intake Requests",
    detail: "Request Detail",
    customer: "Customer Resolution",
    opportunity: "Opportunity",
    swo: "SWO Gate",
    tasks: "Task Mapping",
    review: "Review Queue",
    admin: "Admin / Config"
  };
  return (
    <div className="topbar">
      <div>
        <h2>{titles[view]}</h2>
        <p>Classic Fireplace ServiceOps prototype. Local mock data, local interactions, and no real API calls.</p>
      </div>
      <span className="assistant-pill">AI assistant-only</span>
    </div>
  );
}

function Dashboard({ requests }: { requests: ServiceRequest[] }) {
  const count = (state: PipelineState) => requests.filter((request) => request.state === state).length;
  const recent = requests.flatMap((request) => request.timeline.slice(0, 1).map((entry) => ({ ...entry, id: request.id, name: request.customerName }))).slice(0, 5);

  return (
    <div className="prototype-stack">
      <div className="ops-kpi-grid">
        <KpiCard label="New Requests" value={count("NEW")} />
        <KpiCard label="Review Required" value={count("REVIEW_REQUIRED")} tone="gold" />
        <KpiCard label="Awaiting SWO Approval" value={count("AWAITING_SWO_APPROVAL")} tone="gold" />
        <KpiCard label="SWOs Created" value={count("SERVICE_SO_CREATED")} tone="green" />
        <KpiCard label="Errors" value={count("ERROR")} tone="danger" />
        <KpiCard label="Completed" value={count("COMPLETED")} />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><h3>Pipeline Health</h3></div>
          <div className="pipeline-strip">
            {pipelineStates.map((state) => <div key={state}><span>{stateLabels[state]}</span><strong>{count(state)}</strong></div>)}
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><h3>Next Recommended Actions</h3></div>
          <div className="action-list">
            {requests.slice(0, 5).map((request) => <Link href={`/requests/${request.id}`} prefetch key={request.id}><strong>{request.id}</strong><span>{request.ai.suggestedNextStep}</span></Link>)}
          </div>
        </section>
        <section className="panel detail-primary">
          <div className="panel-header"><h3>Recent Activity</h3></div>
          <div className="action-list">
            {recent.map((item) => <Link href={`/requests/${item.id}`} prefetch key={`${item.id}-${item.at}`}><strong>{item.id} · {item.name}</strong><span>{item.action}: {item.note}</span></Link>)}
          </div>
        </section>
      </div>
    </div>
  );
}

function Intake(props: { requests: ServiceRequest[]; search: string; setSearch: (value: string) => void; stateFilter: "ALL" | PipelineState; setStateFilter: (value: "ALL" | PipelineState) => void; reviewOnly: boolean; setReviewOnly: (value: boolean) => void }) {
  return (
    <section className="panel">
      <div className="prototype-filters">
        <input className="input" value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Search requests, customers, city, phone" />
        <select className="select" value={props.stateFilter} onChange={(event) => props.setStateFilter(event.target.value as "ALL" | PipelineState)}>
          <option value="ALL">All pipeline states</option>
          {pipelineStates.map((state) => <option key={state} value={state}>{stateLabels[state]}</option>)}
        </select>
        <label className="toggle-row"><input type="checkbox" checked={props.reviewOnly} onChange={(event) => props.setReviewOnly(event.target.checked)} /> Review only</label>
      </div>
      <DataTable requests={props.requests} />
    </section>
  );
}

function CustomerResolution({ request }: { request: ServiceRequest }) {
  return (
    <div className="detail-grid">
      <section className="panel detail-primary">
        <div className="panel-header"><h3>Match Candidates</h3><StatusBadge status={request.state} /></div>
        <div className="candidate-list">
          {request.matchCandidates.map((candidate) => (
            <article key={candidate.customerId}>
              <strong>{candidate.name}</strong><span>{candidate.confidence}% confidence</span><p>{candidate.reason}</p>
              <small>Contact: {candidate.contactStatus} · Location: {candidate.locationStatus}</small>
            </article>
          ))}
          {!request.matchCandidates.length ? <p className="empty-state">No candidates in this mock state.</p> : null}
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h3>Operator Choices</h3></div>
        <div className="choice-stack">
          <button className="btn primary">Use Selected Match</button>
          <button className="btn">Manual Override</button>
          <button className="btn">Create New Customer</button>
        </div>
      </section>
    </div>
  );
}

function OpportunityView({ request }: { request: ServiceRequest }) {
  return (
    <div className="detail-grid">
      <section className="panel detail-primary">
        <div className="panel-header"><h3>{request.normalized.generatedOpportunityTitle}</h3><span className="stage-badge">{request.striven.opportunityStage ?? "Not created"}</span></div>
        <div className="html-preview">
          <h4>HTML Description Preview</h4>
          <p><strong>Service:</strong> {request.serviceDetails}</p>
          <p><strong>Make/Model/Age:</strong> {request.makeModelAge}</p>
          <p><strong>Preferred Days:</strong> {request.preferredDays.join(", ")}</p>
          <p><strong>Anything Else:</strong> {request.anythingElse}</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h3>Custom Field Checklist</h3></div>
        <EligibilityChecklist checks={Object.keys(opportunityCustomFields).map((label) => ({ label: `${label} = ${opportunityCustomFields[label as keyof typeof opportunityCustomFields]}`, passed: true }))} />
        <p className="panel-footnote">Live stage check mock: {request.striven.opportunityStage ?? "No opportunity yet"}</p>
      </section>
    </div>
  );
}

function SwoGate({ request, onCreate }: { request: ServiceRequest; onCreate: () => void }) {
  const gate = evaluateSwoGate(request);
  return (
    <section className="panel narrow-panel">
      <div className="panel-header"><h3>SWO Creation Eligibility</h3><StatusBadge status={request.state} /></div>
      <EligibilityChecklist checks={gate.checks} />
      <div className="panel-body"><button className="btn primary" disabled={!gate.canCreateSwo} onClick={onCreate}>Create SWO</button></div>
    </section>
  );
}

function TaskMapping() {
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <div className="panel-header"><h3>Calendar Events</h3></div>
        <div className="action-list">{calendarEvents.map((event) => <div key={event.id}><strong>{event.title}</strong><span>{event.technician} · {event.address} · {new Date(event.startsAt).toLocaleString()}</span></div>)}</div>
      </section>
      <section className="panel">
        <div className="panel-header"><h3>Striven Tasks</h3></div>
        <div className="action-list">{strivenTasks.map((task) => <div key={task.id}><strong>{task.soNumber} · {task.customerName}</strong><span>{task.matchConfidence}% · {task.technician} · {task.matchMethod}</span></div>)}</div>
      </section>
    </div>
  );
}

function ReviewQueue({ requests, onAction }: { requests: ServiceRequest[]; onAction: (id: string, action: string) => void }) {
  return <div className="review-grid">{requests.map((request) => <ReviewCard key={request.id} request={request} onAction={(action) => onAction(request.id, action)} />)}</div>;
}

function Admin() {
  return (
    <div className="prototype-stack">
      <div className="config-grid">
        {Object.entries(configValues).map(([key, value]) => <ConfigCard key={key} title={key} value={value} />)}
      </div>
      <div className="dashboard-grid">
        <section className="panel"><div className="panel-header"><h3>System Status</h3></div><div className="action-list"><div><strong>TEST_MODE</strong><span>Enabled mock toggle</span></div><div><strong>OpenRouter</strong><span>Assistant-only, never final decision-maker</span></div><div><strong>Striven Health</strong><span>Mock healthy · no network calls</span></div><div><strong>Token Cache</strong><span>Mock warm · expires in 42 minutes</span></div></div></section>
        <section className="panel"><div className="panel-header"><h3>Preferred Days Map</h3></div><div className="action-list">{Object.entries(preferredDaysMap).map(([day, id]) => <div key={day}><strong>{day}</strong><span>{id}</span></div>)}</div></section>
      </div>
    </div>
  );
}
