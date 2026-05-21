/*
 * 035_Google_Calendar_Adapter.ts
 * Read-only technician calendar adapter. Uses Google Calendar API when an API
 * key can read the calendar, then falls back to public Google iCal feeds.
 */

import "server-only";
import { getCalendarTechnicians, getEnv } from "@/lib/config/serviceops-config";
import type { CalendarEvent } from "@/lib/serviceops/types";
import { safeText } from "@/lib/serviceops/normalization";

type GoogleEvent = {
  id?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export async function readTechnicianCalendarEvents(start: Date, end: Date) {
  const technicians = getCalendarTechnicians();
  const results = await Promise.allSettled(
    technicians.map(async (tech) => readOneCalendar(tech, start, end))
  );

  const events: CalendarEvent[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    const tech = technicians[index];
    if (result.status === "fulfilled") {
      events.push(...result.value);
      return;
    }
    errors.push(`${tech.name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
  });

  events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { events, errors };
}

async function readOneCalendar(
  tech: { name: string; calendarId: string; color?: string },
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const errors: string[] = [];

  try {
    return await readCalendarViaApi(tech, start, end);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  try {
    return await readCalendarViaIcs(tech, start, end);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  throw new Error(errors.join(" | "));
}

async function readCalendarViaApi(
  tech: { name: string; calendarId: string },
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const key = getEnv().googleCalendarApiKey;
  if (!key) throw new Error("Missing GOOGLE_CALENDAR_API_KEY.");

  const params = new URLSearchParams({
    key,
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    maxResults: "2500"
  });

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(tech.calendarId)}/events?${params.toString()}`;
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => null) as { items?: GoogleEvent[]; error?: { message?: string } } | null;

  if (!response.ok) {
    throw new Error(json?.error?.message || `Google Calendar API returned HTTP ${response.status}.`);
  }

  return (json?.items || []).map((event, index) => {
    const startValue = event.start?.dateTime || event.start?.date || "";
    const endValue = event.end?.dateTime || event.end?.date || startValue;
    const allDay = !!event.start?.date && !event.start?.dateTime;

    return {
      id: `google-${tech.name}-${event.id || index}`,
      technician: tech.name,
      calendarId: tech.calendarId,
      title: safeText(event.summary) || "Busy",
      location: safeText(event.location),
      description: safeText(event.description),
      start: normalizeCalendarDate(startValue, allDay),
      end: normalizeCalendarDate(endValue, allDay),
      allDay,
      source: "google" as const
    };
  }).filter((event) => event.start);
}

async function readCalendarViaIcs(
  tech: { name: string; calendarId: string },
  start: Date,
  end: Date
): Promise<CalendarEvent[]> {
  const url = `https://calendar.google.com/calendar/ical/${encodeURIComponent(tech.calendarId)}/public/basic.ics`;
  const response = await fetch(url, { cache: "no-store" });
  const text = await response.text();

  if (!response.ok || !/BEGIN:VCALENDAR/i.test(text)) {
    throw new Error(`Public iCal feed unavailable (HTTP ${response.status}).`);
  }

  return parseIcs(text, tech)
    .filter((event) => eventIntersects(event, start, end));
}

function parseIcs(text: string, tech: { name: string; calendarId: string }): CalendarEvent[] {
  const lines = unfoldIcsLines(text);
  const events: CalendarEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (current) {
        const uid = current.UID || `${tech.name}-${events.length}`;
        const startRaw = current.DTSTART || "";
        const endRaw = current.DTEND || startRaw;
        const allDay = /^\d{8}$/.test(startRaw);
        const event = {
          id: `ics-${uid}`,
          technician: tech.name,
          calendarId: tech.calendarId,
          title: decodeIcsValue(current.SUMMARY || "Busy"),
          location: decodeIcsValue(current.LOCATION || ""),
          description: decodeIcsValue(current.DESCRIPTION || ""),
          start: parseIcsDate(startRaw, allDay),
          end: parseIcsDate(endRaw, allDay),
          allDay,
          source: "google" as const
        };
        if (event.start) events.push(event);
      }
      current = null;
      continue;
    }

    if (!current) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const rawKey = line.slice(0, separator);
    const key = rawKey.split(";")[0].toUpperCase();
    current[key] = line.slice(separator + 1);
  }

  return events;
}

function unfoldIcsLines(text: string) {
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (/^[ \t]/.test(line) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line.trimEnd());
    }
  }
  return out;
}

function parseIcsDate(value: string, allDay: boolean) {
  if (!value) return "";
  if (allDay && /^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day).toISOString();
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (!match) return "";

  const date = value.endsWith("Z")
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6])))
    : new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeCalendarDate(value: string, allDay: boolean) {
  if (!value) return "";
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function decodeIcsValue(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function eventIntersects(event: CalendarEvent, start: Date, end: Date) {
  const eventStart = new Date(event.start).getTime();
  const eventEnd = new Date(event.end || event.start).getTime();
  if (Number.isNaN(eventStart)) return false;
  return eventEnd >= start.getTime() && eventStart <= end.getTime();
}
