/*
 * 049_Logs_Page.tsx
 * Customer-level operator logs with export tools.
 */

import { AppFrame } from "@/components/app-frame";
import { CustomerLogsTable } from "@/components/customer-logs-table";
import { PageHeader } from "@/components/page-header";
import { getCurrentAuditRows, getCurrentIntakeRows } from "@/lib/serviceops/live-data";

export default async function LogsPage() {
  const [audit, intake] = await Promise.all([getCurrentAuditRows(), getCurrentIntakeRows()]);

  return (
    <AppFrame>
      <PageHeader
        title="Customer Logs"
        description="Operator reports, automation events, Striven IDs, and request history grouped into a searchable customer log."
      />
      <CustomerLogsTable auditRows={audit.rows} intakeRows={intake.rows} />
    </AppFrame>
  );
}
