"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import type { TechnicianProfile } from "@/lib/serviceops/types";

type FormState = {
  id?: string;
  name: string;
  active: boolean;
  role: string;
  phone: string;
  email: string;
  calendarId: string;
  color: string;
  homeAddress: string;
  preferredStartAddress: string;
  serviceAreas: string;
  skills: string;
  capacityPerDay: number;
  notes: string;
  sortOrder: number;
};

const blank: FormState = {
  name: "",
  active: true,
  role: "Service Technician",
  phone: "",
  email: "",
  calendarId: "",
  color: "#8a2f16",
  homeAddress: "",
  preferredStartAddress: "",
  serviceAreas: "",
  skills: "",
  capacityPerDay: 5,
  notes: "",
  sortOrder: 99
};

export function TechnicianProfileForm({ profile, mode = "create", compact = false }: { profile?: TechnicianProfile; mode?: "create" | "edit"; compact?: boolean }) {
  const [form, setForm] = useState<FormState>(() => profile ? fromProfile(profile) : blank);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/technicians", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Could not save technician.");
      setStatus("success");
      setMessage("Saved");
      if (mode === "create") {
        window.location.href = `/technicians/${encodeURIComponent(result.profile.id)}`;
      } else {
        window.location.reload();
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  function setValue<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form className={compact ? "technician-form compact" : "technician-form"} onSubmit={submit}>
      <div className="technician-form-grid">
        <label>
          <span>Name</span>
          <input className="input" value={form.name} onChange={(event) => setValue("name", event.target.value)} required />
        </label>
        <label>
          <span>Role</span>
          <input className="input" value={form.role} onChange={(event) => setValue("role", event.target.value)} />
        </label>
        <label>
          <span>Daily capacity</span>
          <input className="input" type="number" min={1} max={10} value={form.capacityPerDay} onChange={(event) => setValue("capacityPerDay", Number(event.target.value || 5))} />
        </label>
        <label>
          <span>Color</span>
          <input className="input color-input" type="color" value={form.color} onChange={(event) => setValue("color", event.target.value)} />
        </label>
        <label>
          <span>Phone</span>
          <input className="input" value={form.phone} onChange={(event) => setValue("phone", event.target.value)} />
        </label>
        <label>
          <span>Email</span>
          <input className="input" type="email" value={form.email} onChange={(event) => setValue("email", event.target.value)} />
        </label>
        <label className="wide">
          <span>Google Calendar ID</span>
          <input className="input" value={form.calendarId} onChange={(event) => setValue("calendarId", event.target.value)} placeholder="Optional calendar id" />
        </label>
        <label className="wide">
          <span>Home address</span>
          <input className="input" value={form.homeAddress} onChange={(event) => setValue("homeAddress", event.target.value)} placeholder="Used when route start is Tech home" />
        </label>
        <label className="wide">
          <span>Preferred start address</span>
          <input className="input" value={form.preferredStartAddress} onChange={(event) => setValue("preferredStartAddress", event.target.value)} placeholder="Overrides home address for route planning" />
        </label>
        <label>
          <span>Service areas</span>
          <textarea className="input" value={form.serviceAreas} onChange={(event) => setValue("serviceAreas", event.target.value)} placeholder="Toronto, Ajax, Pickering" />
        </label>
        <label>
          <span>Skills</span>
          <textarea className="input" value={form.skills} onChange={(event) => setValue("skills", event.target.value)} placeholder="Clean and service, gas fireplace, BBQ" />
        </label>
        <label className="wide">
          <span>Notes</span>
          <textarea className="input" value={form.notes} onChange={(event) => setValue("notes", event.target.value)} placeholder="Availability, preferences, restrictions" />
        </label>
      </div>
      <div className="technician-form-actions">
        <label className="switch-row">
          <input type="checkbox" checked={form.active} onChange={(event) => setValue("active", event.target.checked)} />
          <span>Active for dispatch</span>
        </label>
        <button className={status === "saving" ? "btn primary is-pending" : "btn primary"} type="submit" disabled={status === "saving"}>
          {status === "saving" ? <Loader2 className="spin" size={15} /> : mode === "create" ? <Plus size={15} /> : <Save size={15} />}
          {mode === "create" ? "Add technician" : "Save profile"}
        </button>
        {message ? <span className={`manual-request-status ${status}`}>{message}</span> : null}
      </div>
    </form>
  );
}

function fromProfile(profile: TechnicianProfile): FormState {
  return {
    id: profile.id,
    name: profile.name,
    active: profile.active,
    role: profile.role,
    phone: profile.phone,
    email: profile.email,
    calendarId: profile.calendarId,
    color: profile.color,
    homeAddress: profile.homeAddress,
    preferredStartAddress: profile.preferredStartAddress,
    serviceAreas: profile.serviceAreas.join(", "),
    skills: profile.skills.join(", "),
    capacityPerDay: profile.capacityPerDay,
    notes: profile.notes,
    sortOrder: profile.sortOrder
  };
}
