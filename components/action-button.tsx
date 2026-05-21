"use client";

/*
 * 015_Action_Button.tsx
 * Client action trigger. Server route performs writes and audit logging.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";

const confirmActions = new Set(["create_opportunity", "create_sales_order", "resolve_customer", "refresh_reports"]);
type ActionStatus = "idle" | "pending" | "success" | "error";

export function ActionButton({ action, sourceRow, label, onDone, variant }: {
  action: string;
  sourceRow?: number;
  label: string;
  variant?: "primary" | "warning";
  onDone?: (message: string) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [toast, setToast] = useState<{ tone: ActionStatus; message: string } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const busy = status === "pending";

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(tone: ActionStatus, message: string) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ tone, message });
    toastTimer.current = tone === "pending"
      ? null
      : window.setTimeout(() => setToast(null), 3600);
  }

  async function run() {
    if (confirmActions.has(action)) {
      const approved = window.confirm(`Run "${label}"${sourceRow ? ` for row ${sourceRow}` : ""}?`);
      if (!approved) return;
    }

    setStatus("pending");
    showToast("pending", `${label} is processing...`);

    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, sourceRow })
      });
      const result = await response.json().catch(() => ({ ok: false, message: "Action returned an unreadable response." }));
      const message = result.message || (result.ok ? "Done" : "Action failed");

      onDone?.(message);
      if (!response.ok || !result.ok) {
        setStatus("error");
        showToast("error", message);
      } else {
        setStatus("success");
        showToast("success", message);
      }

      window.setTimeout(() => router.refresh(), 500);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onDone?.(message);
      setStatus("error");
      showToast("error", message);
    }
  }

  const buttonLabel = busy ? "Working..." : label;

  return (
    <>
      <button
        className={`btn ${variant || ""} is-${status}`}
        onClick={run}
        disabled={busy}
        title={label}
        aria-busy={busy}
      >
        {busy ? <Loader2 className="spin" size={16} /> : status === "success" ? <CheckCircle2 size={16} /> : status === "error" ? <AlertCircle size={16} /> : <PlayCircle size={16} />}
        {buttonLabel}
      </button>
      {toast ? (
        <div className={`action-toast ${toast.tone}`} role="status">
          {toast.tone === "pending" ? <Loader2 className="spin" size={16} /> : toast.tone === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toast.message}</span>
        </div>
      ) : null}
    </>
  );
}
