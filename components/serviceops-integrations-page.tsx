"use client";

import { Bot, CalendarClock, CheckCircle2, Eye, EyeOff, Mail, MessageSquare, Plus, Save, Server, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

type IntegrationId = "striven" | "calendar" | "email" | "sms" | "assistant";

type IntegrationTemplate = {
  id: string;
  name: string;
  body: string;
};

type IntegrationConfig = {
  id: IntegrationId;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  status: "verified" | "needs_review" | "not_connected";
  enabled: boolean;
  fields: Array<{ label: string; value: string; secret?: boolean; placeholder?: string }>;
  templates: IntegrationTemplate[];
  variables: string[];
};

const initialIntegrations: IntegrationConfig[] = [
  {
    id: "striven",
    label: "Striven",
    description: "Customer, opportunity, sales order, and work order records.",
    icon: Server,
    status: "verified",
    enabled: true,
    fields: [
      { label: "API base URL", value: "https://api.striven.com/v1" },
      { label: "Web base URL", value: "https://classicfireplace.striven.com" },
      { label: "Client ID", value: "Configured in environment", secret: true },
      { label: "Client Secret", value: "Stored server-side only", secret: true }
    ],
    templates: [
      {
        id: "customer-note",
        name: "Customer Note",
        body: "ServiceOps matched {customer_name} from {request_channel}. Review {confidence_signal} before creating or linking records."
      },
      {
        id: "work-order-handoff",
        name: "Work Order Handoff",
        body: "Create SWO for {service_type} at {service_address}. Fireplace: {fireplace_details}. Office notes: {office_notes}."
      }
    ],
    variables: ["{customer_name}", "{request_channel}", "{confidence_signal}", "{service_type}", "{service_address}", "{fireplace_details}", "{office_notes}"]
  },
  {
    id: "calendar",
    label: "Google Calendar",
    description: "Technician calendars, availability checks, and dispatch planning.",
    icon: CalendarClock,
    status: "verified",
    enabled: true,
    fields: [
      { label: "Calendar API key", value: "Configured in environment", secret: true },
      { label: "Office calendar", value: "service@classicfireplace.ca" },
      { label: "Technician calendars", value: "Configured profiles" }
    ],
    templates: [
      {
        id: "technician-event",
        name: "Technician Event",
        body: "{service_type} for {customer_name}. Window: {arrival_window}. Address: {service_address}. SWO: {work_order_id}."
      },
      {
        id: "route-note",
        name: "Route Note",
        body: "Clustered with {nearby_jobs}. Drive estimate: {drive_time}. Access notes: {access_notes}."
      }
    ],
    variables: ["{service_type}", "{customer_name}", "{arrival_window}", "{service_address}", "{work_order_id}", "{nearby_jobs}", "{drive_time}", "{access_notes}"]
  },
  {
    id: "email",
    label: "Email",
    description: "Office replies, intake confirmations, and missing-detail requests.",
    icon: Mail,
    status: "needs_review",
    enabled: false,
    fields: [
      { label: "From name", value: "Classic Fireplace Service" },
      { label: "From address", value: "service@classicfireplace.ca" },
      { label: "Reply routing", value: "Shared office inbox" }
    ],
    templates: [
      {
        id: "missing-details",
        name: "Missing Details",
        body: "Hi {customer_name}, thanks for contacting Classic Fireplace. Could you send {missing_fields} so we can prepare your service request?"
      },
      {
        id: "booking-confirmation",
        name: "Booking Confirmation",
        body: "Hi {customer_name}, your service visit is tentatively planned for {scheduled_date}. We will confirm the technician window once dispatch is finalized."
      }
    ],
    variables: ["{customer_name}", "{missing_fields}", "{scheduled_date}", "{service_type}", "{service_address}", "{office_phone}"]
  },
  {
    id: "sms",
    label: "SMS",
    description: "Short customer updates through a future Twilio-style provider.",
    icon: MessageSquare,
    status: "not_connected",
    enabled: false,
    fields: [
      { label: "Provider", value: "Twilio or equivalent" },
      { label: "Account SID", value: "", secret: true, placeholder: "ACxxxxxxxx" },
      { label: "Auth token", value: "", secret: true, placeholder: "Enter token" },
      { label: "From number", value: "", placeholder: "+14165551234" }
    ],
    templates: [
      {
        id: "arrival-reminder",
        name: "Arrival Reminder",
        body: "Classic Fireplace reminder: {technician_name} is scheduled for {arrival_window} at {service_address}. Reply here or call {office_phone}."
      },
      {
        id: "more-info",
        name: "More Info Needed",
        body: "Classic Fireplace needs a little more info for your service request: {missing_fields}. Reply when you can and we will keep it moving."
      }
    ],
    variables: ["{technician_name}", "{arrival_window}", "{service_address}", "{office_phone}", "{missing_fields}", "{customer_name}"]
  },
  {
    id: "assistant",
    label: "OpenAI Assistant",
    description: "Read-only summaries, matching rationale, and operator-facing recommendations.",
    icon: Bot,
    status: "verified",
    enabled: true,
    fields: [
      { label: "Model route", value: "ServiceOps assistant" },
      { label: "Write permissions", value: "Disabled by policy" },
      { label: "API key", value: "Configured in environment", secret: true }
    ],
    templates: [
      {
        id: "intake-summary",
        name: "Intake Summary",
        body: "Summarize the request from {customer_name}, identify missing fields, confidence signals, and the safest next operator action."
      },
      {
        id: "match-rationale",
        name: "Match Rationale",
        body: "Explain why {candidate_customer} is or is not a safe match for {incoming_request}. Highlight conflicting contact or address signals."
      }
    ],
    variables: ["{customer_name}", "{candidate_customer}", "{incoming_request}", "{missing_fields}", "{confidence_signal}", "{next_action}"]
  }
];

export function ServiceOpsIntegrationsPage() {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [activeId, setActiveId] = useState<IntegrationId>("striven");
  const [showSecrets, setShowSecrets] = useState(false);
  const active = useMemo(() => integrations.find((item) => item.id === activeId) || integrations[0], [activeId, integrations]);
  const ActiveIcon = active.icon;

  function updateActive(patch: Partial<IntegrationConfig>) {
    setIntegrations((current) => current.map((item) => item.id === active.id ? { ...item, ...patch } : item));
  }

  function updateTemplate(templateId: string, patch: Partial<IntegrationTemplate>) {
    updateActive({
      templates: active.templates.map((template) => template.id === templateId ? { ...template, ...patch } : template)
    });
  }

  return (
    <section className="integrations-page">
      <div className="integrations-topbar">
        <div>
          <span>ServiceOps Connections</span>
          <h1>Integrations</h1>
          <p>Configure the channels that move an intake from first contact through customer match, scheduling, and work order handoff.</p>
        </div>
        <div className="integrations-actions">
          <button className="btn" type="button" onClick={() => setShowSecrets((value) => !value)} title={showSecrets ? "Hide secret fields" : "Show secret fields"}>
            {showSecrets ? <EyeOff size={16} /> : <Eye size={16} />}
            {showSecrets ? "Hide Secrets" : "Show Secrets"}
          </button>
          <button className="btn primary" type="button"><Save size={16} /> Save All</button>
        </div>
      </div>

      <div className="integration-tabs" role="tablist" aria-label="ServiceOps integrations">
        {integrations.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-selected={active.id === item.id}
              className={active.id === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setActiveId(item.id)}
              role="tab"
              type="button"
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="integration-layout">
        <section className="integration-main">
          <header className="integration-card-header">
            <div>
              <span><ActiveIcon size={16} /> {active.label}</span>
              <h2>{active.description}</h2>
            </div>
            <StatusBadge status={active.status} />
          </header>

          <div className="integration-enable-row">
            <div>
              <strong>{active.label} automation</strong>
              <span>{active.enabled ? "Enabled for operator workflows" : "Disabled until reviewed"}</span>
            </div>
            <button className={active.enabled ? "toggle active" : "toggle"} type="button" onClick={() => updateActive({ enabled: !active.enabled })} aria-pressed={active.enabled}>
              <span />
            </button>
          </div>

          <div className="integration-fields">
            {active.fields.map((field) => (
              <label key={field.label}>
                <span>{field.label}</span>
                <input
                  value={field.secret && !showSecrets ? maskValue(field.value) : field.value}
                  placeholder={field.placeholder}
                  onChange={(event) => {
                    const fields = active.fields.map((item) => item.label === field.label ? { ...item, value: event.target.value } : item);
                    updateActive({ fields });
                  }}
                />
              </label>
            ))}
          </div>

          <div className="integration-test-row">
            <button className="btn" type="button" disabled={active.status === "not_connected"}><CheckCircle2 size={16} /> Test Connection</button>
            <span>{connectionCopy(active.status)}</span>
          </div>
        </section>

        <aside className="integration-side">
          <strong>Operational Boundary</strong>
          <p>Secrets stay server-side. This screen models configuration and message content; production writes still pass through deterministic ServiceOps gates.</p>
          <div>
            <span className="badge ok">Customer Match</span>
            <span className="badge info">Scheduling</span>
            <span className="badge warn">Human Review</span>
          </div>
        </aside>
      </div>

      <section className="integration-templates">
        <header>
          <div>
            <span>Message Templates</span>
            <h2>{active.label} templates</h2>
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => updateActive({ templates: [...active.templates, { id: `template-${Date.now()}`, name: "New Template", body: "" }] })}
          >
            <Plus size={16} /> Add
          </button>
        </header>

        <div className="template-grid">
          {active.templates.map((template) => (
            <article className="template-editor" key={template.id}>
              <div className="template-title-row">
                <input value={template.name} onChange={(event) => updateTemplate(template.id, { name: event.target.value })} aria-label="Template name" />
                <button type="button" onClick={() => updateActive({ templates: active.templates.filter((item) => item.id !== template.id) })} title="Delete template"><Trash2 size={15} /></button>
              </div>
              <textarea value={template.body} onChange={(event) => updateTemplate(template.id, { body: event.target.value })} aria-label={`${template.name} body`} />
            </article>
          ))}
        </div>

        <p className="template-variables">Variables: {active.variables.join(" ")}</p>
      </section>
    </section>
  );
}

function StatusBadge({ status }: { status: IntegrationConfig["status"] }) {
  if (status === "verified") return <span className="badge ok">Verified</span>;
  if (status === "needs_review") return <span className="badge warn">Needs review</span>;
  return <span className="badge danger">Not connected</span>;
}

function connectionCopy(status: IntegrationConfig["status"]) {
  if (status === "verified") return "Last check succeeded with current server configuration.";
  if (status === "needs_review") return "Review credentials and routing before enabling live sends.";
  return "Add provider credentials before testing this connection.";
}

function maskValue(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "****";
  return `${"*".repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}
