/*
 * 040_Route_Planner_Page.tsx
 * Daily technician assignment by request priority and address proximity.
 */

import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { RoutePlannerView } from "@/components/route-planner-view";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";
import { buildDailyRoutePlan } from "@/lib/serviceops/route-planner";

export const dynamic = "force-dynamic";

export default async function RoutePlannerPage() {
  const intake = await getCurrentIntakeRows();
  const plan = await buildDailyRoutePlan(intake.rows, {
    date: new Date().toISOString().slice(0, 10),
    tasksPerTech: 5,
    useAi: false
  });

  return (
    <AppFrame>
      <PageHeader
        title="Route Planner"
        description="Oldest open requests first, grouped by address proximity for daily dispatch."
      />
      <RoutePlannerView initialPlan={plan} />
    </AppFrame>
  );
}
