"use client";

import { useState } from "react";
import { Mail, Phone, Plus, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";

export function ManualRequestCard() {
  const router = useRouter();
  const [channel, setChannel] = useState<"Phone" | "Email">("Phone");
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [requestType, setRequestType] = useState("");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("pending");
    setMessage("Adding request...");

    try {
      const trimmedContact = contact.trim();
      const email = trimmedContact.includes("@") ? trimmedContact : "";
      const phone = email ? "" : trimmedContact;

      const response = await fetch("/api/manual-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, customerName, phone, email, requestType, details })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Could not add request.");

      setStatus("success");
      setMessage("Added to Intake.");
      setCustomerName("");
      setContact("");
      setRequestType("");
      setDetails("");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="panel manual-request">
      <div className="panel-header compact">
        <h3>New Request</h3>
        <div className="icon-tabs" aria-label="Request source">
          <button type="button" className={channel === "Phone" ? "active" : ""} onClick={() => setChannel("Phone")} title="Phone request"><Phone size={15} /></button>
          <button type="button" className={channel === "Email" ? "active" : ""} onClick={() => setChannel("Email")} title="Email request"><Mail size={15} /></button>
        </div>
      </div>
      <form className="manual-request-form" onSubmit={submit}>
        <input className="input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Name" required />
        <input className="input" value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Phone or email" />
        <input className="input" value={requestType} onChange={(event) => setRequestType(event.target.value)} placeholder="Request" />
        <input className="input manual-notes" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Quick notes" />
        <div className="manual-request-actions">
          <button className={`btn primary is-${status}`} type="submit" disabled={status === "pending"}>
            <Plus size={15} /> Add
          </button>
          <button className="btn" type="button" title="Clear" onClick={() => { setCustomerName(""); setContact(""); setRequestType(""); setDetails(""); setStatus("idle"); setMessage(""); }}>
            <RotateCcw size={15} />
          </button>
          {message ? <span className={`manual-request-status ${status}`}>{message}</span> : null}
        </div>
      </form>
    </section>
  );
}
