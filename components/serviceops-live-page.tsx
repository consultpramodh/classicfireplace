import { SimplifiedServiceOps, type SimpleOpsView } from "@/components/simplified-serviceops";
import { getCustomerHistory } from "@/lib/serviceops/customer-history";
import { getCurrentIntakeRows, getCurrentTaskMappingRows } from "@/lib/serviceops/live-data";

export async function ServiceOpsLivePage({ view, requestId, pipelineStage }: { view: SimpleOpsView; requestId?: string; pipelineStage?: string }) {
  const [intake, tasks] = await Promise.all([getCurrentIntakeRows(), getCurrentTaskMappingRows()]);
  const customerHistory = buildCustomerHistorySummary(intake.rows);

  return (
    <SimplifiedServiceOps
      view={view}
      requestId={requestId}
      pipelineStage={pipelineStage}
      initial={{
        rows: intake.rows,
        taskRows: tasks.rows,
        source: intake.source,
        refreshedAt: intake.refreshedAt || tasks.refreshedAt,
        stale: Boolean(intake.stale || tasks.stale),
        error: intake.error || tasks.error || "",
        customerHistory,
        intake: {
          source: intake.source,
          refreshedAt: intake.refreshedAt,
          stale: intake.stale,
          error: intake.error,
          count: intake.rows.length
        },
        tasks: {
          source: tasks.source,
          refreshedAt: tasks.refreshedAt,
          stale: tasks.stale,
          error: tasks.error,
          count: tasks.rows.length
        }
      }}
    />
  );
}

function buildCustomerHistorySummary(rows: { strivenCustomerId?: string }[]) {
  const ids = Array.from(new Set(rows.map((row) => String(row.strivenCustomerId || "").trim()).filter(Boolean)));
  return Object.fromEntries(ids.map((customerId) => {
    const history = getCustomerHistory({ customerId });
    return [customerId, {
      invoices: history.invoices.slice(0, 12),
      assets: history.assets.slice(0, 12),
      installationTasks: history.installationTasks.slice(0, 12),
      warnings: history.warnings
    }];
  }));
}
