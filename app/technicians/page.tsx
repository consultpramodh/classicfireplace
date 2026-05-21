/*
 * 043_Technicians_Page.tsx
 * Technician directory and add-new form.
 */

import Link from "next/link";
import { CalendarDays, MapPin, Plus, Route, UserRoundCog, Users } from "lucide-react";
import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { TechnicianProfileForm } from "@/components/technician-profile-form";
import { listCalendarEvents, listTaskMappingRows, listTechnicianProfiles } from "@/lib/db/repository";
import { technicianProfileHref } from "@/lib/serviceops/technician-links";

export const dynamic = "force-dynamic";

export default function TechniciansPage() {
  const profiles = listTechnicianProfiles();
  const events = listCalendarEvents();
  const tasks = listTaskMappingRows();

  return (
    <AppFrame>
      <PageHeader
        title="Technicians"
        description="Profiles, routes, calendars, skills, and daily capacity."
        actions={<Link className="btn" href="/route-planner"><Route size={15} /> Plan routes</Link>}
      />

      <section className="technicians-workspace">
        <div className="panel">
          <div className="panel-header">
            <h3><Users size={15} /> Team</h3>
            <span className="badge info">{profiles.filter((profile) => profile.active).length} active</span>
          </div>
          <div className="technician-list">
            {profiles.map((profile) => {
              const eventCount = events.filter((event) => event.technician === profile.name).length;
              const techTasks = tasks.filter((task) => task.tech === profile.name);
              const openTaskCount = techTasks.filter((task) => !/complete|closed|cancel/i.test(task.taskStatus || "")).length;
              return (
                <Link className="technician-row-card" href={technicianProfileHref(profile.id)} key={profile.id}>
                  <span className="tech-avatar" style={{ background: profile.color }}>{initials(profile.name)}</span>
                  <div className="technician-row-main">
                    <strong>{profile.name}</strong>
                    <small>{profile.role || "Service Technician"} · {profile.skills.length ? profile.skills.slice(0, 2).join(", ") : "Skills not set"}</small>
                  </div>
                  <div className="technician-row-metrics">
                    <span><strong>{profile.capacityPerDay || 5}</strong> cap</span>
                    <span><strong>{eventCount}</strong> cal</span>
                    <span><strong>{openTaskCount}</strong> open</span>
                  </div>
                  <div className="technician-row-detail">
                    <span><MapPin size={14} /> {profile.preferredStartAddress || profile.homeAddress || "Start missing"}</span>
                    <span><CalendarDays size={14} /> {profile.calendarId ? "Calendar" : "No calendar"}</span>
                  </div>
                  <span className={profile.active ? "badge ok" : "badge"}>{profile.active ? "Active" : "Inactive"}</span>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="panel technician-create-panel">
          <div className="panel-header">
            <h3><Plus size={15} /> Add</h3>
            <span className="badge info">Local</span>
          </div>
          <TechnicianProfileForm mode="create" compact />
        </aside>
      </section>
    </AppFrame>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "T";
}
