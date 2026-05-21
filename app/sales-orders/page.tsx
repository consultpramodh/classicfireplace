/*
 * 025_Sales_Orders_Page.tsx
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

export default async function SalesOrdersPage() {
  const result = await getCurrentIntakeRows();
  const rows = result.rows;
  const visibleRows = rows.slice(0, 150);

  return (
    <AppFrame>
      <PageHeader title="Sales Orders" description={`Service Sales Orders are gated by opportunity stage, duplicate checks, LocationId, and non-zero pricing. Data source: ${result.source}.`} />
      {result.error ? <section className="panel error" style={{ marginBottom: 16 }}>{result.error}</section> : null}
      <section className="panel">
        <div className="panel-header"><h3>SO Gate</h3><span className="badge warn">Showing {visibleRows.length} of {rows.length}</span></div>
        <div className="table-wrap">
          <table className="ops-table">
            <thead><tr><th>Row</th><th>Customer</th><th>Customer ID</th><th>Opp ID</th><th>Stage</th><th>Make/Model/Age</th><th>SO</th><th>Action</th></tr></thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sourceRow}</td>
                  <td><Link className="inline-link" href={customerDashboardHref(row)}>{customerDisplayName(row)}</Link></td>
                  <td>{row.strivenCustomerId ? <StrivenRecordLink type="customer" id={row.strivenCustomerId} compact>{row.strivenCustomerId}</StrivenRecordLink> : <span className="badge warn">Missing</span>}</td>
                  <td>{row.strivenOppId ? <StrivenRecordLink type="opportunity" id={row.strivenOppId} accountId={row.strivenCustomerId} compact>{row.strivenOppId}</StrivenRecordLink> : <span className="badge warn">Missing</span>}</td>
                  <td><StatusBadge value={row.opportunityStage || "Not ready"} /></td>
                  <td>{row.makeModelAge || <span className="badge warn">Missing</span>}</td>
                  <td>{row.strivenSoId ? <StrivenRecordLink type="salesOrder" id={row.strivenSoId} compact><span className="badge ok">{row.salesOrderNumber || row.strivenSoId}</span></StrivenRecordLink> : <span className="badge">Not created</span>}</td>
                  <td><ActionButton action="create_sales_order" sourceRow={row.sourceRow} label="Create SO" variant="warning" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppFrame>
  );
}
