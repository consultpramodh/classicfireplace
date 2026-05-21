/*
 * 026_Tasks_Calendar_Page.tsx
 */

import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { StatusBadge } from "@/components/status-badge";
import { StrivenRecordLink } from "@/components/striven-record-link";
import { getCurrentTaskMappingRows } from "@/lib/serviceops/live-data";

export const dynamic = "force-dynamic";

export default async function TasksCalendarPage() {
  const result = await getCurrentTaskMappingRows();
  const rows = result.rows;

  return (
    <AppFrame>
      <PageHeader
        title="Tasks & Calendar"
        description={`Calendar-to-task/SO matching visibility. No task or calendar writes happen automatically. Data source: ${result.source}.`}
        actions={<ActionButton action="refresh_reports" label="Refresh reports" variant="primary" />}
      />
      {result.error ? <section className="panel error" style={{ marginBottom: 16 }}>{result.error}</section> : null}
      <section className="panel">
        <div className="panel-header"><h3>Service Task Mapping</h3><span className="badge">{rows.length} rows</span></div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead><tr><th>Event</th><th>Tech</th><th>Title</th><th>Location</th><th>SO#</th><th>Match</th><th>Task</th><th>Dates</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.eventId}>
                  <td>{row.eventId}</td>
                  <td>{row.tech}</td>
                  <td>{row.title}</td>
                  <td>{row.location}</td>
                  <td>{row.soNumber || <span className="badge warn">Missing</span>}</td>
                  <td>{row.matchMethod}</td>
                  <td>{row.taskId ? <StrivenRecordLink type="task" id={row.taskId} compact>{`${row.taskId} - ${row.taskName}`}</StrivenRecordLink> : <span className="badge warn">Unmatched</span>}</td>
                  <td><StatusBadge value={row.datesMatch || "Not checked"} /></td>
                  <td><StatusBadge value={row.rowStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppFrame>
  );
}
