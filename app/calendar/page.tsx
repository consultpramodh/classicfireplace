/*
 * 038_Calendar_Page.tsx
 * Google-Calendar-inspired technician schedule view backed by local snapshots.
 */

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { listTechnicianProfiles } from "@/lib/db/repository";
import { getCurrentCalendarEvents } from "@/lib/serviceops/live-data";
import { technicianProfileHref } from "@/lib/serviceops/technician-links";
import type { CalendarEvent } from "@/lib/serviceops/types";

export const dynamic = "force-dynamic";

type CalendarView = "day" | "week" | "month";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const params = await searchParams;
  const view = normalizeView(params.view);
  const anchor = parseDate(params.date) || new Date();
  const result = await getCurrentCalendarEvents();
  const technicians = listTechnicianProfiles().filter((profile) => profile.active);
  const colors = Object.fromEntries(technicians.map((tech) => [tech.name, tech.color]));

  const range = view === "month" ? monthRange(anchor) : view === "day" ? dayRange(anchor) : weekRange(anchor);
  const visibleEvents = result.rows.filter((event) => eventIntersects(event, range.start, range.end));
  const title = view === "month"
    ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `${formatShort(range.start)} - ${formatShort(range.end)}`;

  return (
    <AppFrame>
      <PageHeader
        title="Calendar"
        description={`Technician schedule view styled after Google Calendar. Data source: ${result.source}${result.error ? " with fallback" : ""}.`}
        actions={<ActionButton action="refresh_reports" label="Refresh calendars" variant="primary" />}
      />

      {result.error ? (
        <section className="panel live-note" style={{ marginBottom: 16 }}>
          <strong>Calendar connection note</strong>
          <p>{result.error}</p>
        </section>
      ) : null}

      <section className="calendar-shell">
        <aside className="calendar-sidebar panel">
          <div className="panel-header">
            <h3>Technicians</h3>
            <CalendarDays size={15} />
          </div>
          <div className="calendar-tech-list">
            {technicians.map((tech) => (
              <div className="calendar-tech" key={tech.id}>
                <i style={{ background: tech.color }} />
                <Link className="inline-link subtle" href={technicianProfileHref(tech.id || tech.name)}>{tech.name}</Link>
              </div>
            ))}
          </div>
          <div className="calendar-connect">
            <strong>Connection</strong>
            <p>Refresh reads configured Google Calendar API/public iCal feeds and stores events locally. If private calendars block access, this page falls back to Service Task Mapping rows.</p>
            <span className="badge info">{result.rows.filter((event) => event.source === "google").length} Google events</span>
            <span className="badge">{result.rows.filter((event) => event.source === "taskMapping").length} mapping fallback</span>
          </div>
        </aside>

        <section className="panel calendar-main">
          <div className="calendar-toolbar">
            <div className="calendar-nav">
              <Link className="btn" href={calendarHref(view, addRange(anchor, view, -1))}><ChevronLeft size={16} /></Link>
              <Link className="btn" href={calendarHref(view, new Date())}>Today</Link>
              <Link className="btn" href={calendarHref(view, addRange(anchor, view, 1))}><ChevronRight size={16} /></Link>
              <h3>{title}</h3>
            </div>
            <div className="segmented-control calendar-view-switch">
              {(["day", "week", "month"] as CalendarView[]).map((item) => (
                <Link key={item} href={calendarHref(item, anchor)} className={view === item ? "active" : ""}>{item}</Link>
              ))}
            </div>
          </div>

          {view === "month"
            ? <MonthView anchor={anchor} events={visibleEvents} colors={colors} />
            : <TimeGrid view={view} start={range.start} events={visibleEvents} colors={colors} />}
        </section>
      </section>
    </AppFrame>
  );
}

function TimeGrid({ view, start, events, colors }: { view: CalendarView; start: Date; events: CalendarEvent[]; colors: Record<string, string> }) {
  const days = view === "day" ? [startOfDay(start)] : Array.from({ length: 7 }, (_, index) => addDays(startOfDay(start), index));
  const hours = Array.from({ length: 12 }, (_, index) => index + 7);

  return (
    <div className="gcal-grid" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(150px, 1fr))` }}>
      <div className="gcal-corner" />
      {days.map((day) => (
        <div className="gcal-day-head" key={day.toISOString()}>
          <span>{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
          <strong>{day.getDate()}</strong>
        </div>
      ))}

      <div className="gcal-time-col">
        {hours.map((hour) => <div key={hour}>{formatHour(hour)}</div>)}
      </div>

      {days.map((day) => (
        <div className="gcal-day-col" key={day.toISOString()}>
          {hours.map((hour) => <div className="gcal-hour-line" key={hour} />)}
          {events.filter((event) => sameDay(new Date(event.start), day)).map((event) => (
            <CalendarEventBlock key={event.id} event={event} color={colors[event.technician] || "#8a2f16"} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CalendarEventBlock({ event, color }: { event: CalendarEvent; color: string }) {
  const start = new Date(event.start);
  const end = new Date(event.end || event.start);
  const startMinutes = Math.max(0, (start.getHours() - 7) * 60 + start.getMinutes());
  const duration = Math.max(30, (end.getTime() - start.getTime()) / 60000);
  const top = (startMinutes / 60) * 58;
  const height = Math.max(34, (duration / 60) * 58 - 4);

  return (
    <div className="gcal-event" style={{ top, height, background: color }}>
      <strong>{event.title}</strong>
      <span>{event.technician} · {formatEventTime(start, end)}</span>
      {event.location ? <small>{event.location}</small> : null}
    </div>
  );
}

function MonthView({ anchor, events, colors }: { anchor: Date; events: CalendarEvent[]; colors: Record<string, string> }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  return (
    <div className="month-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div className="month-head" key={day}>{day}</div>)}
      {days.map((day) => {
        const dayEvents = events.filter((event) => sameDay(new Date(event.start), day));
        return (
          <div className={day.getMonth() === anchor.getMonth() ? "month-cell" : "month-cell muted"} key={day.toISOString()}>
            <div className="month-date">{day.getDate()}</div>
            {dayEvents.slice(0, 3).map((event) => (
              <div className="month-event" style={{ borderColor: colors[event.technician] || "#8a2f16" }} key={event.id}>
                {event.title}
              </div>
            ))}
            {dayEvents.length > 3 ? <span className="month-more">+{dayEvents.length - 3} more</span> : null}
          </div>
        );
      })}
    </div>
  );
}

function normalizeView(value?: string): CalendarView {
  return value === "day" || value === "month" ? value : "week";
}

function parseDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calendarHref(view: CalendarView, date: Date) {
  return `/calendar?view=${view}&date=${date.toISOString().slice(0, 10)}`;
}

function addRange(date: Date, view: CalendarView, direction: number) {
  const next = new Date(date);
  if (view === "month") next.setMonth(next.getMonth() + direction);
  else next.setDate(next.getDate() + (view === "day" ? direction : direction * 7));
  return next;
}

function dayRange(date: Date) {
  return { start: startOfDay(date), end: endOfDay(date) };
}

function weekRange(date: Date) {
  const start = startOfWeek(date);
  return { start, end: endOfDay(addDays(start, 6)) };
}

function monthRange(date: Date) {
  return { start: new Date(date.getFullYear(), date.getMonth(), 1), end: endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0)) };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date) {
  const start = startOfDay(date);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset);
  return start;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function eventIntersects(event: CalendarEvent, start: Date, end: Date) {
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end || event.start).getTime();
  return !Number.isNaN(eventStart) && eventEnd >= start.getTime() && eventStart <= end.getTime();
}

function formatShort(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatHour(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour > 12 ? hour - 12 : hour;
  return `${display} ${suffix}`;
}

function formatEventTime(start: Date, end: Date) {
  return `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} - ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}
