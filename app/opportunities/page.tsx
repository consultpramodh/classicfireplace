/*
 * 024_Opportunities_Page.tsx
 */

import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { ActionButton } from "@/components/action-button";
import { StatusBadge } from "@/components/status-badge";
import { StrivenRecordLink } from "@/components/striven-record-link";
import { getCurrentIntakeRows } from "@/lib/serviceops/live-data";
import { customerDashboardHref, customerDisplayName } from "@/lib/serviceops/customer-links";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const result = await getCurrentIntakeRows();
  const rows = result.rows;
  const visibleRows = rows.slice(0, 150);

  return (
    <AppFrame>
      <PageHeader title="Opportunities" description={`Create opportunities only after customer resolution, then check live/current stage before sales order creation. Data source: ${result.source}.`} />
      {result.error ? <section className="panel error" style={{ marginBottom: 16 }}>{result.error}</section> : null}
      <section className="panel">
        <div className="panel-header"><h3>Opportunity Review</h3><span className="badge">Showing {visibleRows.length} of {rows.length}</span></div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead><tr><th>Row</th><th>Title Preview</th><th>Customer ID</th><th>Opp ID</th><th>Stage</th><th>Preferred Days</th><th>Actions</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sourceRow}</td>
                  <td>
                    <Link className="inline-link" href={customerDashboardHref(row)}>
                      {`Webform: ${customerDisplayName(row)}${row.city ? ` - ${row.city}` : ""}${row.phone ? ` - ${row.phone}` : ""}`}
                    </Link>
                  </td>
                  <td>{row.strivenCustomerId ? <StrivenRecordLink type="customer" id={row.strivenCustomerId} compact>{row.strivenCustomerId}</StrivenRecordLink> : <span className="badge warn">Missing</span>}</td>
                  <td>{row.strivenOppId ? <StrivenRecordLink type="opportunity" id={row.strivenOppId} accountId={row.strivenCustomerId} compact><span className="badge ok">{row.strivenOppId}</span></StrivenRecordLink> : <span className="badge warn">Missing</span>}</td>
                  <td><StatusBadge value={row.opportunityStage || "Not checked"} /></td>
                  <td>{row.preferredDays || "-"}</td>
                  <td className="row-actions">
                    <ActionButton action="create_opportunity" sourceRow={row.sourceRow} label="Create" />
                    <ActionButton action="check_opportunity_stage" sourceRow={row.sourceRow} label="Check stage" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppFrame>
  );
}
