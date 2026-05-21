import { NextRequest, NextResponse } from "next/server";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";
import { buildDailyRoutePlan } from "@/lib/serviceops/route-planner";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const intake = await getCurrentIntakeRows();
  const plan = await buildDailyRoutePlan(intake.rows, {
    date: String(body.date || ""),
    tasksPerTech: Number(body.tasksPerTech || 5),
    startMode: body.startMode,
    endMode: body.endMode,
    officeAddress: typeof body.officeAddress === "string" ? body.officeAddress : undefined,
    techHomeAddresses: body.techHomeAddresses && typeof body.techHomeAddresses === "object" ? body.techHomeAddresses : undefined,
    capacityByTech: body.capacityByTech && typeof body.capacityByTech === "object" ? body.capacityByTech : undefined,
    mapProvider: body.mapProvider === "apple" || body.mapProvider === "osm" || body.mapProvider === "google" ? body.mapProvider : undefined,
    useAi: body.useAi !== false
  });

  return NextResponse.json({ ok: true, plan });
}
