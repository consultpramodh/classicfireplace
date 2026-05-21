"use client";

/*
 * 033_Dashboard_View.tsx
 * Interactive date and workflow filters for dashboard snapshots.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Filter, RotateCcw, Search } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { ManualRequestCard } from "@/components/manual-request-card";
import { StatusBadge } from "@/components/status-badge";
import { customerDashboardHref, customerDisplayName } from "@/lib/serviceops/customer-links";
import type { AuditLogEntry, IntakeRow, TaskMappingRow } from "@/lib/serviceops/types";

type RangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_7"
  | "this_month"
  | "last_30"
  | "quarter"
  | "this_year"
  | "last_90"
  | "all"
  | "custom";

const datePresets: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This Week" },
  { value: "last_7", label: "Last 7" },
  { value: "this_month", label: "This Month" },
  { value: "last_30", label: "Last 30" },
  { value: "quarter", label: "Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "last_90", label: "Last 90" },
  { value: "all", label: "All Time" },
  { value: "custom", label: "Custom" }
];

export function DashboardView({
  rows,
  taskRows,
  audit,
  dataSource,
  dataNote,
  refreshedAt,
  stale
}: {
  rows: IntakeRow[];
  taskRows: TaskMappingRow[];
  audit: AuditLogEntry[];
  dataSource: string;
  dataNote?: string;
  refreshedAt?: string;
  stale?: boolean;
}) {
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [query, setQuery] = useState("");

  const stateOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => row.pipelineState).filter(Boolean))).sort();
    return [
      { value: "all", label: "All states" },
      { value: "needs_review", label: "Needs review" },
      { value: "ready_so", label: "Ready for SO" },
      { value: "errors", label: "Errors" },
      ...values.map((value) => ({ value, label: value }))
    ];
  }, [rows]);

  const dateRange = useMemo(() => buildDateRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const filteredRows = useMemo(() => {
    const q = normalizeSearchValue(query);
    return rows
      .map((row, index) => {
      const submitted = parseDate(row.submittedAt);
      const matchesDate = dateRangeContains(dateRange, submitted);
      const matchesState =
        stateFilter === "all" ||
        row.pipelineState === stateFilter ||
        (stateFilter === "needs_review" && (row.needsReview || !!row.lastError)) ||
        (stateFilter === "errors" && (row.pipelineState === "ERROR" || !!row.lastError)) ||
        (stateFilter === "ready_so" && row.opportunityStage === "Service Work Order Created" && !row.strivenSoId);
      const score = scoreSearchMatch(row, q);

      return {
        row,
        index,
        include: matchesDate && matchesState && (!q || score > 0),
        score
      };
    })
      .filter((item) => item.include)
      .sort((a, b) => {
        if (!q) return a.index - b.index;
        if (b.score !== a.score) return b.score - a.score;
        return a.index - b.index;
      })
      .map((item) => item.row);
  }, [rows, dateRange, stateFilter, query]);

  const filteredAudit = useMemo(() => {
    return audit.filter((entry) => dateRangeContains(dateRange, parseDate(entry.timestamp)));
  }, [audit, dateRange]);

  const newIntake = filteredRows.filter((row) => !row.strivenCustomerId || row.pipelineState === "NEW_ROW");
  const needsReview = filteredRows.filter((row) => row.needsReview || row.lastError);
  const customerResolved = filteredRows.filter((row) => row.strivenCustomerId);
  const opportunityCreated = filteredRows.filter((row) => row.strivenOppId);
  const readyForSo = filteredRows.filter((row) => row.opportunityStage === "Service Work Order Created" && !row.strivenSoId);
  const soCreated = filteredRows.filter((row) => row.strivenSoId);
  const taskMatched = filteredRows.filter((row) => row.taskMatched);
  const errors = filteredRows.filter((row) => row.pipelineState === "ERROR" || row.lastError);

  const tiles = [
    { label: "New Intake", value: newIntake.length, href: "/intake", tone: "info" },
    { label: "Needs Review", value: needsReview.length, href: "/review-queue", tone: "warn" },
    { label: "Customer Resolved", value: customerResolved.length, href: "/customer-resolution", tone: "ok" },
    { label: "Opportunity Created", value: opportunityCreated.length, href: "/opportunities", tone: "ok" },
    { label: "Ready for SO", value: readyForSo.length, href: "/sales-orders", tone: "warn" },
    { label: "SO Created", value: soCreated.length, href: "/sales-orders", tone: "ok" },
    { label: "Task Matched", value: taskMatched.length, href: "/calendar", tone: "ok" },
    { label: "Errors", value: errors.length, href: "/review-queue", tone: "danger" }
  ];

  function resetFilters() {
    setPreset("this_month");
    setCustomStart("");
    setCustomEnd("");
    setStateFilter("all");
    setQuery("");
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Dashboard</h2>
          <p>{dataSource}{dataNote ? " · fallback" : ""}{refreshedAt ? ` · ${formatRelativeTime(refreshedAt)}` : ""}</p>
        </div>
        <div className="toolbar">
          <ActionButton action="refresh_reports" label="Refresh reports" variant="primary" />
        </div>
      </div>

      {dataNote ? (
        <section className="panel live-note" style={{ marginBottom: 16 }}>
          <strong>Live data note</strong>
          <p>{dataNote}</p>
        </section>
      ) : null}

      <section className="dashboard-filters panel">
        <div className="filter-heading">
          <div>
            <strong>View</strong>
            <span>{dateRange.label} · {filteredRows.length} of {rows.length} rows · {refreshedAt ? `Last refreshed ${formatRelativeTime(refreshedAt)}` : "Not refreshed yet"}{stale ? " · stale" : ""}</span>
          </div>
          <button className="btn icon-only" onClick={resetFilters} title="Reset filters"><RotateCcw size={15} /></button>
        </div>

        <div className="segmented-control date-range-control" aria-label="Date range">
          {datePresets.map((item) => (
            <button
              key={item.value}
              className={preset === item.value ? "active" : ""}
              onClick={() => setPreset(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="unified-search" role="search">
          <div className="input-with-icon search-box">
              <Search size={15} />
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search row, name, email, phone, city, customer, opportunity, SO"
              />
          </div>
          <div className="state-filter">
            <Filter size={14} />
            <select className="select" value={stateFilter} onChange={(event) => setStateFilter(event.target.value)} aria-label="State filter">
              {stateOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
        </div>

        {preset === "custom" ? (
          <div className="filter-row custom-range-row">
            <label className="filter-field">
              <span>Start date</span>
              <input className="input" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
            </label>
            <label className="filter-field">
              <span>End date</span>
              <input className="input" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
            </label>
          </div>
        ) : null}
      </section>

      <ManualRequestCard />

      <section className="snapshot-grid">
        {tiles.map((tile) => (
          <Link className="snapshot-tile" href={tile.href} key={tile.label}>
            <span className={`badge ${tile.tone}`}>{tile.label}</span>
            <strong>{tile.value}</strong>
            <small>Open page <ArrowRight size={14} /></small>
          </Link>
        ))}
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>Priority Review</h3>
            <Link className="btn" href="/review-queue">Open Review Queue</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Row</th><th>Customer</th><th>Submitted</th><th>State</th><th>Issue</th></tr></thead>
              <tbody>
                {needsReview.slice(0, 5).map((row) => (
                  <tr key={row.id}>
                    <td>{displaySourceRow(row.sourceRow)}</td>
                    <td><Link className="inline-link" href={customerDashboardHref(row)}>{customerDisplayName(row)}</Link></td>
                    <td>{row.submittedAt || "-"}</td>
                    <td><StatusBadge value={row.pipelineState} /></td>
                    <td>{row.lastError || "Review requested"}</td>
                  </tr>
                ))}
                {!needsReview.length ? <tr><td colSpan={5}>No review items in this view.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Ready for Sales Order</h3>
            <Link className="btn" href="/sales-orders">Open Sales Orders</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Row</th><th>Customer</th><th>Submitted</th><th>Opportunity</th><th>Stage</th></tr></thead>
              <tbody>
                {readyForSo.slice(0, 5).map((row) => (
                  <tr key={row.id}>
                    <td>{displaySourceRow(row.sourceRow)}</td>
                    <td><Link className="inline-link" href={customerDashboardHref(row)}>{customerDisplayName(row)}</Link></td>
                    <td>{row.submittedAt || "-"}</td>
                    <td>{row.strivenOppId}</td>
                    <td><StatusBadge value={row.opportunityStage} /></td>
                  </tr>
                ))}
                {!readyForSo.length ? <tr><td colSpan={5}>No stage-ready rows in this view.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <h3>Task Mapping Snapshot</h3>
            <Link className="btn" href="/calendar">Open Calendar</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                {["No Task", "Dates Mismatch", "Missing IDs", "In Sync"].map((status) => (
                  <tr key={status}>
                    <td><StatusBadge value={status} /></td>
                    <td>{taskRows.filter((row) => row.rowStatus === status).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel-footnote"><CalendarDays size={14} /> Task mapping reflects the current calendar sync, not the intake date filter.</p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>Recent Audit</h3>
            <Link className="btn" href="/audit-log">Open Audit Log</Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Action</th><th>Row</th><th>Result</th></tr></thead>
              <tbody>
                {filteredAudit.slice(0, 5).map((entry) => (
                  <tr key={entry.id || `${entry.action}-${entry.timestamp}`}>
                    <td>{entry.action}</td>
                    <td>{displaySourceRow(entry.sourceRow)}</td>
                    <td><StatusBadge value={entry.result} /></td>
                  </tr>
                ))}
                {!filteredAudit.length ? <tr><td colSpan={3}>No audit entries in this date view.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function buildDateRange(preset: RangePreset, customStart: string, customEnd: string) {
  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = null;
  let label = "";

  if (preset === "all") {
    return { start, end, label: "All time" };
  }

  if (preset === "custom") {
    start = customStart ? startOfDay(parseDateInput(customStart)) : null;
    end = customEnd ? endOfDay(parseDateInput(customEnd)) : null;
    label = start || end ? `${formatShortDate(start)} - ${formatShortDate(end)}` : "Custom range";
    return { start, end, label };
  }

  if (preset === "today") {
    start = startOfDay(now);
    end = endOfDay(now);
    label = "Today";
  }

  if (preset === "yesterday") {
    const yesterday = addDays(now, -1);
    start = startOfDay(yesterday);
    end = endOfDay(yesterday);
    label = "Yesterday";
  }

  if (preset === "this_week") {
    start = startOfWeek(now);
    end = endOfDay(now);
    label = "This week";
  }

  if (preset === "last_7") {
    start = startOfDay(addDays(now, -6));
    end = endOfDay(now);
    label = "Last 7 days";
  }

  if (preset === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = endOfDay(now);
    label = "This month";
  }

  if (preset === "last_30") {
    start = startOfDay(addDays(now, -29));
    end = endOfDay(now);
    label = "Last 30 days";
  }

  if (preset === "last_90") {
    start = startOfDay(addDays(now, -89));
    end = endOfDay(now);
    label = "Last 90 days";
  }

  if (preset === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterStartMonth, 1);
    end = endOfDay(now);
    label = "Quarter to date";
  }

  if (preset === "this_year") {
    start = new Date(now.getFullYear(), 0, 1);
    end = endOfDay(now);
    label = "This year";
  }

  return { start, end, label };
}

function dateRangeContains(range: { start: Date | null; end: Date | null }, date: Date | null) {
  if (!range.start && !range.end) return true;
  if (!date) return false;
  const time = date.getTime();
  if (range.start && time < range.start.getTime()) return false;
  if (range.end && time > range.end.getTime()) return false;
  return true;
}

function parseDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateInput(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 0, 0, 0, 0);
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function startOfWeek(value: Date) {
  const date = startOfDay(value);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatShortDate(value: Date | null) {
  if (!value) return "";
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(value: string) {
  const date = parseDate(value);
  if (!date) return "unknown";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function displaySourceRow(value: number | null | undefined) {
  const row = Number(value || 0);
  if (!row) return "-";
  return row < 0 ? `M${Math.abs(row)}` : String(row);
}

function scoreSearchMatch(row: IntakeRow, query: string) {
  if (!query) return 1;

  const exactFields = [
    row.sourceRow,
    row.email,
    row.phone,
    row.altPhone,
    row.strivenCustomerId,
    row.strivenOppId,
    row.strivenSoId,
    row.salesOrderNumber
  ].map(normalizeSearchValue).filter(Boolean);

  if (exactFields.some((value) => value === query)) return 1000;

  const name = normalizeSearchValue(`${row.firstName || ""} ${row.lastName || ""}`);
  if (name === query) return 950;
  if (exactFields.some((value) => value.startsWith(query)) || name.startsWith(query)) return 800;

  const haystack = [
    row.sourceRow,
    row.firstName,
    row.lastName,
    row.email,
    row.phone,
    row.altPhone,
    row.street,
    row.city,
    row.province,
    row.postalCode,
    row.pipelineState,
    row.opportunityStage,
    row.strivenCustomerId,
    row.strivenOppId,
    row.strivenSoId,
    row.salesOrderNumber,
    row.lastError
  ].map(normalizeSearchValue).filter(Boolean);

  if (haystack.some((value) => value.includes(query))) return 600;

  const compactQuery = query.replace(/\s+/g, "");
  if (compactQuery.length >= 3 && haystack.some((value) => value.replace(/\s+/g, "").includes(compactQuery))) {
    return 400;
  }

  const words = query.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => haystack.some((value) => value.includes(word)))) return 300;

  return 0;
}

function normalizeSearchValue(value: unknown) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase()
    .replace(/[()\-+.]/g, "")
    .replace(/\s+/g, " ");
}
