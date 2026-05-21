"use client";

/*
 * 045_Workspace_Nav.tsx
 * Lightweight orientation bar: back, breadcrumbs, and common jumps.
 */

import { ArrowLeft, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type SearchRow = {
  id: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  phone?: string;
  email?: string;
  details?: string;
  salesOrderNumber?: string;
  strivenSoId?: string;
  pipelineState?: string;
  submittedAt?: string;
};

const pageNames: Record<string, string> = {
  dashboard: "Command",
  pipeline: "Pipeline",
  intake: "Intake Queue",
  "customer-resolution": "Customer Resolution",
  opportunity: "Opportunity Follow-Up",
  "calendar-mapping": "Technician Calendar",
  "review-queue": "Review Desk",
  "work-orders": "Scheduling Queue",
  schedule: "Technician Calendar",
  "swo-gate": "SWO Gate",
  admin: "System Admin",
  requests: "Intake Queue",
  "agent-logs": "Agent Logs",
  integrations: "Integrations",
  logs: "Customer Logs"
};

export function WorkspaceNav() {
  const pathname = usePathname();
  const router = useRouter();
  const crumbs = buildCrumbs(pathname);
  const [fontScale, setFontScale] = useState(() => readSavedFontScale());
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRows, setSearchRows] = useState<SearchRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const profileWrapRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResults = useMemo(() => findSearchResults(searchRows, searchQuery), [searchRows, searchQuery]);

  useEffect(() => {
    document.documentElement.style.setProperty("--desk-font-scale", String(fontScale));
    window.localStorage.setItem("serviceops-font-scale", String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!searchWrapRef.current?.contains(event.target as Node)) setSearchOpen(false);
      if (!profileWrapRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSearchOpen(false);
      setProfileOpen(false);
      searchInputRef.current?.blur();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!searchOpen || searchRows.length) return;
    let cancelled = false;
    setSearchLoading(true);
    fetch("/api/intake", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { rows?: SearchRow[] }) => {
        if (!cancelled) setSearchRows(Array.isArray(payload.rows) ? payload.rows : []);
      })
      .catch(() => {
        if (!cancelled) setSearchRows([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchOpen, searchRows.length]);

  return (
    <div className="workspace-nav">
      <button className="btn workspace-back-button" type="button" onClick={() => router.back()} title="Go back">
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>

      <div className="workspace-crumbs" aria-label="Current location">
        <Link href="/dashboard" title="Dashboard" prefetch>Classic Fireplace</Link>
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.href}-${index}`}>
            <i>/</i>
            {index === crumbs.length - 1 ? <strong>{crumb.label}</strong> : <Link href={crumb.href} prefetch>{crumb.label}</Link>}
          </span>
        ))}
      </div>

      <div className="top-search-wrap" ref={searchWrapRef}>
        <label className={`top-search ${searchOpen ? "active" : ""}`}>
          <Search size={16} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => {
              setProfileOpen(false);
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearchOpen(false);
                searchInputRef.current?.blur();
              }
              if (event.key === "Enter" && searchResults[0]) {
                event.preventDefault();
                setSearchOpen(false);
                router.push(`/requests/${encodeURIComponent(searchResults[0].id)}`);
              }
            }}
            placeholder="Search requests, customers, SOs"
          />
        </label>
        {searchOpen ? (
          <div className="top-search-results">
            {searchLoading ? <div className="top-search-empty">Loading request index...</div> : null}
            {!searchLoading && !searchQuery.trim() ? <div className="top-search-empty">Search by customer, city, phone, email, SO, or issue.</div> : null}
            {!searchLoading && searchQuery.trim() && !searchResults.length ? <div className="top-search-empty">No matching requests.</div> : null}
            {searchResults.map((row) => (
              <Link href={`/requests/${encodeURIComponent(row.id)}`} key={row.id} onClick={() => setSearchOpen(false)}>
                <strong>{displaySearchName(row)}</strong>
                <span>{[row.city, row.phone, row.salesOrderNumber || row.strivenSoId, row.pipelineState].filter(Boolean).join(" · ")}</span>
                <small>{row.details || row.email || row.id}</small>
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <div className="top-font-controls" aria-label="Text size controls">
        <button type="button" onClick={() => setFontScale((value) => Math.max(0.9, Number((value - 0.05).toFixed(2))))}>A-</button>
        <button type="button" onClick={() => setFontScale((value) => Math.min(1.3, Number((value + 0.05).toFixed(2))))}>A+</button>
      </div>
      <div className="profile-menu-wrap" ref={profileWrapRef}>
        <button
          className="user-avatar"
          type="button"
          onClick={() => {
            setSearchOpen(false);
            setProfileOpen((value) => !value);
          }}
          aria-expanded={profileOpen}
          aria-haspopup="menu"
          title="Profile"
        >
          CF
        </button>
        {profileOpen ? (
          <div className="profile-menu">
            <header>
              <strong>Classic Fireplace</strong>
              <span>Operations Admin</span>
            </header>
            <Link href="/admin" onClick={() => setProfileOpen(false)}><UserRound size={15} /> Account details</Link>
            <Link href="/admin" onClick={() => setProfileOpen(false)}><Settings size={15} /> Personalisation</Link>
            <button type="button" onClick={() => setFontScale(1)}><Search size={15} /> Reset text size</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildCrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  return parts.map((part, index) => {
    const href = `/${parts.slice(0, index + 1).join("/")}`;
    return {
      href,
      label: pageNames[part] || humanize(part)
    };
  });
}

function humanize(value: string) {
  const decoded = decodeURIComponent(value);
  return decoded
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function readSavedFontScale() {
  if (typeof window === "undefined") return 1;
  const saved = Number(window.localStorage.getItem("serviceops-font-scale"));
  if (!Number.isFinite(saved)) return 1;
  return Math.min(1.3, Math.max(0.9, saved));
}

function findSearchResults(rows: SearchRow[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return rows
    .map((row) => ({ row, score: scoreSearchRow(row, needle) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.row);
}

function scoreSearchRow(row: SearchRow, needle: string) {
  const fields = [
    [row.id, 9],
    [displaySearchName(row), 8],
    [row.phone, 7],
    [row.email, 7],
    [row.salesOrderNumber, 7],
    [row.strivenSoId, 7],
    [row.city, 5],
    [row.pipelineState, 4],
    [row.details, 3]
  ] as const;
  return fields.reduce((score, [value, weight]) => {
    const text = String(value || "").toLowerCase();
    if (!text) return score;
    if (text === needle) return score + weight * 4;
    if (text.startsWith(needle)) return score + weight * 2;
    return text.includes(needle) ? score + weight : score;
  }, 0);
}

function displaySearchName(row: SearchRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email || row.phone || row.id;
}
