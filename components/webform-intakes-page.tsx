"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Search, Sparkles } from "lucide-react";
import type { IntakeRow } from "@/lib/serviceops/types";
import { assessIntakeComplexity } from "@/lib/serviceops/complexity";
import { dedupeIntakeForms } from "@/lib/serviceops/dedupe";
import { sortRequestsRecentFirst } from "@/lib/serviceops/sorting";

type Props = {
  rows: IntakeRow[];
  source: "demo" | "cache" | "empty";
  refreshedAt?: string;
  stale?: boolean;
  error?: string;
};

export function WebformIntakesPage({ rows, source, refreshedAt, stale, error }: Props) {
  const [query, setQuery] = useState("");
  const [aiReads, setAiReads] = useState<Record<string, AiReadState>>({});
  const sortedRows = useMemo(() => dedupeIntakeForms(sortRequestsRecentFirst(rows)), [rows]);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return sortedRows;
    return sortedRows.filter((row) =>
      [
        row.firstName,
        row.lastName,
        row.email,
        row.phone,
        row.altPhone,
        row.street,
        row.city,
        row.postalCode,
        row.details,
        row.anythingElse,
        row.pipelineState
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, sortedRows]);
  const metrics = useMemo(() => {
    const needsReview = sortedRows.filter((row) => row.needsReview || row.lastError).length;
    const newRows = sortedRows.filter((row) => !row.strivenCustomerId && !row.strivenSoId && !row.needsReview && !row.lastError).length;
    const workOrders = sortedRows.filter((row) => row.strivenSoId).length;
    const matched = sortedRows.filter((row) => row.strivenCustomerId && !row.strivenSoId).length;
    return { needsReview, newRows, workOrders, matched };
  }, [sortedRows]);

  return (
    <div className="webform-intakes">
      <section className="webform-command">
        <div>
          <span className="eyebrow">Webform Intakes</span>
          <h1>Intake Queue</h1>
          <p>Newest first. Resolve identity, catch risk, and move clean requests forward.</p>
        </div>
        <div className="webform-metrics" aria-label="Intake totals">
          <MetricChip label="Total" value={sortedRows.length} tone="neutral" />
          <MetricChip label="Review" value={metrics.needsReview} tone="rose" />
          <MetricChip label="New" value={metrics.newRows} tone="blue" />
          <MetricChip label="Matched" value={metrics.matched} tone="green" />
          <MetricChip label="Work Orders" value={metrics.workOrders} tone="teal" />
        </div>
      </section>

      <section className="webform-toolbar">
        <label className="webform-search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, phone, city, email, issue..." />
        </label>
        <div className="webform-count">
          <span>{source === "cache" ? "Live cache" : source}</span>
          <strong>{visibleRows.length}</strong> of <strong>{sortedRows.length}</strong>
          {refreshedAt ? <small>{stale ? "May be stale" : "Updated"} {formatDate(refreshedAt)}</small> : null}
        </div>
      </section>

      {error ? <div className="webform-note"><AlertTriangle size={18} /> {error}</div> : null}

      <section className="webform-list" aria-label="Webform intake requests">
        {visibleRows.map((row) => (
          <IntakeCard key={row.id} row={row} aiState={aiReads[row.id]} setAiReads={setAiReads} />
        ))}
      </section>

      {!visibleRows.length ? <div className="webform-empty">No webform intakes match that search.</div> : null}
    </div>
  );
}

function IntakeCard({ row, aiState, setAiReads }: {
  row: IntakeRow;
  aiState?: AiReadState;
  setAiReads: React.Dispatch<React.SetStateAction<Record<string, AiReadState>>>;
}) {
  const complexity = assessIntakeComplexity(row);

  return (
    <article className={`webform-card webform-row ${complexity.level.toLowerCase()}`}>
      <div className="intake-cell customer-cell">
        <span className="cell-label">Customer</span>
        <h2>{fullName(row)}</h2>
        <p>{[row.city, row.province, row.postalCode].filter(Boolean).join(", ") || "No location provided"}</p>
        <span className="submitted-at"><Clock size={14} /> {formatDate(row.submittedAt)}</span>
      </div>
      <div className="intake-cell contact-cell">
        <span className="cell-label">Contact</span>
        <p>{row.phone || "No primary phone"}</p>
        <p>{row.altPhone ? `Alt ${row.altPhone}` : "No alternate phone"}</p>
        <p>{row.email || "No email"}</p>
      </div>
      <div className="intake-cell request-cell">
        <div className="request-line">
          <span className={`complexity-pill ${complexity.level.toLowerCase()}`}>{complexity.level} · {complexity.label}</span>
          <span>{complexity.recommendedTechnician}</span>
        </div>
        <p className="webform-summary">{row.details || row.anythingElse || "No service details provided."}</p>
        <div className="webform-fields">
          <span><b>Preferred</b> {row.preferredDays || "Not provided"}</span>
          <span><b>Unit</b> {row.makeModelAge || "Not provided"}</span>
          {complexity.missingFields.length ? <span><b>Missing</b> {complexity.missingFields.slice(0, 3).join(", ")}</span> : <span><b>Fields</b> Complete</span>}
        </div>
      </div>
      <div className="intake-cell ops-cell">
        <StatusPill row={row} />
        <div className="next-action">
          <span>Next action</span>
          <strong>{nextStep(row)}</strong>
        </div>
        <a className="primary-row-action" href={`/requests/${encodeURIComponent(row.id)}`}>Open Intake</a>
      </div>
      <details className="agent-drawer">
        <summary>AI and match tools</summary>
        <div className="agent-drawer-grid">
          <AiReadPanel row={row} state={aiState} setState={setAiReads} />
          <CustomerMatchAgentPanel row={row} />
        </div>
      </details>
    </article>
  );
}

function MetricChip({ label, value, tone }: { label: string; value: number; tone: "neutral" | "rose" | "blue" | "green" | "teal" }) {
  return (
    <div className={`metric-chip ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

type AiRead = {
  summary: string;
  likelyCategory: string;
  urgency: "low" | "normal" | "high";
  suggestedNextStep: string;
  questionsToAsk: string[];
  caution: string;
};

type AgentEvent = {
  event: string;
  data: Record<string, unknown>;
};

function CustomerMatchAgentPanel({ row }: { row: IntakeRow }) {
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  async function runAgent() {
    setRunning(true);
    setEvents([]);
    setText("");
    setError("");

    try {
      const response = await fetch("/api/agents/serviceops/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: "customer_match", sourceRow: row.sourceRow })
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Agent stream failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const parsed = parseSseChunk(chunk);
          if (!parsed) continue;
          setEvents((current) => [...current, parsed]);
          if (parsed.event === "text.delta" && typeof parsed.data.delta === "string") {
            setText((current) => current + parsed.data.delta);
          }
          if (parsed.event === "agent.completed_text" && typeof parsed.data.text === "string") {
            setText((current) => current || String(parsed.data.text));
          }
          if (parsed.event === "agent.error") {
            setError(String(parsed.data.error || "Agent failed."));
          }
        }
      }
    } catch (agentError) {
      setError(agentError instanceof Error ? agentError.message : "Agent failed.");
    } finally {
      setRunning(false);
    }
  }

  const toolEvents = events.filter((event) => event.event.startsWith("tool."));
  const started = events.find((event) => event.event === "agent.started");

  return (
    <div className="match-agent-panel">
      <div className="match-agent-head">
        <div>
          <span>Customer Match Agent</span>
          <strong>{started ? String(started.data.selectedModel || "Model selected") : "Strict identity check"}</strong>
        </div>
        <button type="button" onClick={runAgent} disabled={running}>
          <Sparkles size={15} />
          {running ? "Running..." : "Run match"}
        </button>
      </div>
      {toolEvents.length ? (
        <div className="agent-steps">
          {toolEvents.map((event, index) => (
            <span key={`${event.event}-${index}`}>{event.event === "tool.started" ? "Checking" : "Done"} · {String(event.data.tool || "tool")}</span>
          ))}
        </div>
      ) : null}
      {text ? <p className="agent-text">{text}</p> : null}
      {error ? <p className="ai-read-error">{error}</p> : null}
      <small>Assistant-only. It cannot merge, create, or update customers.</small>
    </div>
  );
}

function parseSseChunk(chunk: string): AgentEvent | null {
  const event = chunk.split("\n").find((line) => line.startsWith("event: "))?.slice(7).trim();
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
  if (!event || !dataLine) return null;
  try {
    return { event, data: JSON.parse(dataLine.slice(6)) };
  } catch {
    return null;
  }
}

type AiReadState = {
  loading?: boolean;
  error?: string;
  data?: AiRead;
};

function AiReadPanel({ row, state, setState }: {
  row: IntakeRow;
  state?: AiReadState;
  setState: React.Dispatch<React.SetStateAction<Record<string, AiReadState>>>;
}) {
  async function runAiRead() {
    setState((current) => ({ ...current, [row.id]: { loading: true } }));
    try {
      const response = await fetch("/api/ai/intake-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: row.firstName,
          lastName: row.lastName,
          city: row.city,
          province: row.province,
          phone: row.phone,
          email: row.email,
          preferredDays: row.preferredDays,
          makeModelAge: row.makeModelAge,
          details: row.details,
          anythingElse: row.anythingElse,
          pipelineState: row.pipelineState,
          lastError: row.lastError,
          needsReview: row.needsReview
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI read failed.");
      setState((current) => ({ ...current, [row.id]: { data: payload } }));
    } catch (error) {
      setState((current) => ({
        ...current,
        [row.id]: { error: error instanceof Error ? error.message : "AI read failed." }
      }));
    }
  }

  return (
    <div className="ai-read">
      <button type="button" onClick={runAiRead} disabled={state?.loading}>
        <Sparkles size={15} />
        {state?.loading ? "Reading..." : state?.data ? "Refresh AI read" : "AI read"}
      </button>
      {state?.error ? <p className="ai-read-error">{state.error}</p> : null}
      {state?.data ? (
        <div className="ai-read-result">
          <div>
            <span>{state.data.likelyCategory}</span>
            <strong>{state.data.urgency} urgency</strong>
          </div>
          <p>{state.data.summary}</p>
          <p><b>Next:</b> {state.data.suggestedNextStep}</p>
          {state.data.questionsToAsk.length ? (
            <ul>
              {state.data.questionsToAsk.map((question) => <li key={question}>{question}</li>)}
            </ul>
          ) : null}
          <small>{state.data.caution}</small>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ row }: { row: IntakeRow }) {
  const tone = row.needsReview || row.lastError ? "attention" : row.strivenSoId ? "work" : row.strivenCustomerId ? "ready" : "new";
  const Icon = tone === "attention" ? AlertTriangle : CheckCircle2;
  return <span className={`webform-status ${tone}`}><Icon size={14} /> {statusLabel(row)}</span>;
}

function statusLabel(row: IntakeRow) {
  if (row.needsReview || row.lastError) return "Needs review";
  if (row.strivenSoId) return "Work order exists";
  if (row.strivenOppId) return "Opportunity exists";
  if (row.strivenCustomerId) return "Customer matched";
  return "New";
}

function nextStep(row: IntakeRow) {
  if (row.needsReview || row.lastError) return "Review the blocker";
  if (!row.strivenCustomerId) return "Resolve customer";
  if (!row.strivenOppId) return "Create opportunity";
  if (!row.strivenSoId) return "Check work order gate";
  if (!row.taskMatched) return "Map schedule task";
  return "No action needed";
}

function fullName(row: IntakeRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unnamed customer";
}

function formatDate(value?: string) {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
