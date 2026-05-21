/*
 * 042_Technicians_API.ts
 * Local technician profile create/update endpoint.
 */

import { NextResponse } from "next/server";
import { listTechnicianProfiles, upsertTechnicianProfile } from "@/lib/db/repository";
import type { TechnicianProfile } from "@/lib/serviceops/types";

export async function GET() {
  return NextResponse.json({ ok: true, profiles: listTechnicianProfiles() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = upsertTechnicianProfile({
      id: text(body.id),
      name: text(body.name),
      active: body.active !== false,
      role: text(body.role),
      phone: text(body.phone),
      email: text(body.email),
      calendarId: text(body.calendarId),
      color: text(body.color),
      homeAddress: text(body.homeAddress),
      preferredStartAddress: text(body.preferredStartAddress),
      serviceAreas: body.serviceAreas,
      skills: body.skills,
      capacityPerDay: Number(body.capacityPerDay || 5),
      notes: text(body.notes),
      sortOrder: Number(body.sortOrder || 99)
    } as Partial<TechnicianProfile> & { name: string });

    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : String(err)
    }, { status: 400 });
  }
}

function text(value: unknown) {
  return String(value || "").trim();
}
