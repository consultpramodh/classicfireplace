"use client";

import type { ServiceRequest } from "@/lib/types";
import { evaluateSwoGate } from "@/lib/pipeline";
import { EligibilityChecklist } from "@/components/eligibility-checklist";
import { StatusBadge } from "@/components/status-badge";
import { Timeline } from "@/components/timeline";

export function RequestDetailPanel({ request, onAction }: { request: ServiceRequest; onAction: (action: string) => void }) {
  const gate = evaluateSwoGate(request);

  return (
    <div className="detail-grid">
      <section className="panel detail-primary">
        <div className="panel-header">
          <div>
            <span>{request.id}</span>
            <h2>{request.customerName}</h2>
          </div>
          <StatusBadge status={request.state} />
        </div>
        <div className="detail-body">
          <div className="field-grid">
            <Info label="Email" value={request.email} />
            <Info label="Phone" value={request.phone} />
            <Info label="Alt Phone" value={request.altPhone || "-"} />
            <Info label="Address" value={request.normalized.fullAddress} />
            <Info label="Preferred Days" value={request.preferredDays.join(", ")} />
            <Info label="Make/Model/Age" value={request.makeModelAge} />
          </div>
          <div className="two-col">
            <Block title="Raw Intake">{request.serviceDetails} {request.anythingElse}</Block>
            <Block title="AI Suggestions">{request.ai.summary} Suggested next step: {request.ai.suggestedNextStep}</Block>
          </div>
          <div className="id-strip">
            <span>Customer {request.striven.customerId ?? "-"}</span>
            <span>Location {request.striven.locationId ?? "-"}</span>
            <span>Opportunity {request.striven.opportunityId ?? "-"}</span>
            <span>SWO {request.striven.serviceOrderNumber ?? "-"}</span>
            <span>Task {request.striven.taskId ?? "-"}</span>
          </div>
          <div className="ops-actions">
            <button className="btn primary" onClick={() => onAction("resolveCustomer")}>Resolve Customer</button>
            <button className="btn" onClick={() => onAction("createOpportunity")}>Create Opportunity</button>
            <button className="btn" onClick={() => onAction("checkSwoApproval")}>Check SWO Approval</button>
            <button className="btn" disabled={!gate.canCreateSwo} onClick={() => onAction("createSwo")}>Create SWO</button>
            <button className="btn" onClick={() => onAction("mapTask")}>Map Task</button>
            <button className="btn warning" onClick={() => onAction("sendReview")}>Send to Review</button>
          </div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header"><h3>SWO Gate</h3></div>
        <EligibilityChecklist checks={gate.checks} />
      </section>
      <section className="panel detail-primary">
        <div className="panel-header"><h3>Audit Timeline</h3></div>
        <Timeline entries={request.timeline} />
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="info-cell"><span>{label}</span><strong>{value}</strong></div>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="text-block"><span>{title}</span><p>{children}</p></section>;
}
