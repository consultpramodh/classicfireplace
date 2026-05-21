/*
 * 044_Technician_Profile_Page.tsx
 * One technician profile with editable dispatch details.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CalendarDays, CheckCircle2, Mail, MapPin, Phone, Route, TriangleAlert, Wrench } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { TechnicianProfileForm } from "@/components/technician-profile-form";
import { getTechnicianProfile, listCalendarEvents, listTaskMappingRows } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function TechnicianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = getTechnicianProfile(decodeURIComponent(id));
  if (!profile) notFound();

  const events = listCalendarEvents().filter((event) => event.technician === profile.name);
  const tasks = listTaskMappingRows().filter((task) => task.tech === profile.name);
  const openTasks = tasks.filter((task) => !/complete|closed|cancel/i.test(task.taskStatus || ""));
  const completedTasks = tasks.filter((task) => /complete|closed/i.test(task.taskStatus || ""));
  const mismatchedTasks = tasks.filter((task) => task.datesMatch === "MISMATCH" || /mismatch|missing/i.test(task.rowStatus || ""));
  const upcomingEvents = events
    .filter((event) => new Date(event.end || event.start).getTime() >= Date.now())
    .slice(0, 8);
  const completionRate = tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const nextEvent = upcomingEvents[0];

  return (
    <AppFrame>
      <section className="panel technician-profile-hero">
        <div className="technician-identity">
          <span className="tech-avatar large" style={{ background: profile.color }}>{initials(profile.name)}</span>
          <div>
            <h2>{profile.name}</h2>
            <p>{profile.active ? "Active for dispatch" : "Inactive"} · {profile.capacityPerDay || 5} stops/day</p>
          </div>
        </div>
        <div className="technician-contact-strip">
          <span><Phone size={14} /> {profile.phone || "Phone missing"}</span>
          <span><Mail size={14} /> {profile.email || "Email missing"}</span>
          <span><MapPin size={14} /> {profile.preferredStartAddress || profile.homeAddress || "Start address missing"}</span>
          <span><CalendarDays size={14} /> {profile.calendarId || "Calendar ID missing"}</span>
          <Link className="btn primary" href="/route-planner"><Route size={15} /> Plan route</Link>
        </div>
      </section>

      <section className="technician-dashboard-strip">
        <div className="snapshot-tile">
          <small><CheckCircle2 size={14} /> Completion</small>
          <strong>{completionRate}%</strong>
        </div>
        <div className="snapshot-tile">
          <small><Wrench size={14} /> Open tasks</small>
          <strong>{openTasks.length}</strong>
        </div>
        <div className="snapshot-tile">
          <small><CalendarDays size={14} /> Upcoming</small>
          <strong>{upcomingEvents.length}</strong>
        </div>
        <div className="snapshot-tile">
          <small><TriangleAlert size={14} /> Needs attention</small>
          <strong>{mismatchedTasks.length}</strong>
        </div>
        <div className="snapshot-tile wide">
          <small><Activity size={14} /> Next stop</small>
          <strong>{nextEvent ? formatDateTime(nextEvent.start) : "None"}</strong>
        </div>
      </section>

      <section className="technician-profile-grid compact">
        <article className="panel">
          <div className="panel-header"><h3>Profile</h3><Route size={15} /></div>
          <div className="profile-list">
            <div><strong>Service areas</strong><p>{profile.serviceAreas.length ? profile.serviceAreas.join(", ") : "Not set"}</p></div>
            <div><strong>Skills</strong><p>{profile.skills.length ? profile.skills.join(", ") : "Not set"}</p></div>
            <div><strong>Notes</strong><p>{profile.notes || "No notes yet."}</p></div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><h3>Upcoming Calendar</h3><CalendarDays size={15} /></div>
          <div className="profile-list compact-list">
            {upcomingEvents.map((event) => (
              <div key={event.id}>
                <strong>{event.title}</strong>
                <p>{formatDateTime(event.start)} · {event.location || "No location"}</p>
              </div>
            ))}
            {!upcomingEvents.length ? <p className="empty compact-empty">No upcoming cached events.</p> : null}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><h3>Open Tasks</h3><Wrench size={15} /></div>
          <div className="profile-list compact-list">
            {openTasks.slice(0, 10).map((task) => (
              <div key={task.eventId || task.taskId}>
                <strong>{task.taskName || task.title || "Task"}</strong>
                <p>{task.taskStatus || "No status"} · SO {task.soNumber || "-"} · {task.location || "No location"}</p>
              </div>
            ))}
            {!openTasks.length ? <p className="empty compact-empty">No open cached tasks.</p> : null}
          </div>
        </article>

        <details className="panel technician-edit-panel">
          <summary className="panel-header"><h3>Edit Profile</h3><span className="badge info">Saved locally</span></summary>
          <TechnicianProfileForm profile={profile} mode="edit" />
        </details>
      </section>
    </AppFrame>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "T";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
