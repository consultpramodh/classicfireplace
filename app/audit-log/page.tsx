/*
 * 028_Audit_Log_Page.tsx
 */

import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { StrivenRecordLink } from "@/components/striven-record-link";
import { getCurrentAuditRows } from "@/lib/serviceops/live-data";

export default function AuditLogPage() {
  const rows = getCurrentAuditRows().rows;

  return (
    <AppFrame>
      <PageHeader title="Audit Log" description="Every action records timestamp, user, source row, Striven IDs, result, error, and response preview." />
      <section className="panel">
        <div className="panel-header"><h3>Action History</h3><span className="badge">{rows.length} entries</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Row</th><th>Customer</th><th>Opp</th><th>SO</th><th>Task</th><th>Result</th><th>Preview</th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id || index}>
                  <td>{row.timestamp}</td>
                  <td>{row.user}</td>
                  <td>{row.action}</td>
                  <td>{row.sourceRow || "-"}</td>
                  <td>{row.strivenCustomerId ? <StrivenRecordLink type="customer" id={row.strivenCustomerId} compact>{row.strivenCustomerId}</StrivenRecordLink> : "-"}</td>
                  <td>{row.opportunityId ? <StrivenRecordLink type="opportunity" id={row.opportunityId} compact>{row.opportunityId}</StrivenRecordLink> : "-"}</td>
                  <td>{row.salesOrderId ? <StrivenRecordLink type="salesOrder" id={row.salesOrderId} compact>{row.salesOrderId}</StrivenRecordLink> : "-"}</td>
                  <td>{row.taskId ? <StrivenRecordLink type="task" id={row.taskId} compact>{row.taskId}</StrivenRecordLink> : "-"}</td>
                  <td><StatusBadge value={row.result} /></td>
                  <td>{row.errorMessage || row.rawResponsePreview || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppFrame>
  );
}
