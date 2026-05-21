/*
 * 037_Analytics_Page.tsx
 * Quantity reporting across intake, task mapping, and Striven report snapshots.
 */

import Link from "next/link";
import { ArrowRight, Gauge, RefreshCw } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { AnalyticsChartPanel } from "@/components/analytics-chart-panel";
import { AppFrame } from "@/components/app-frame";
import { PageHeader } from "@/components/page-header";
import { buildAnalytics, type QuantityRow } from "@/lib/serviceops/analytics";
import { getCurrentIntakeRows, getCurrentTaskMappingRows } from "@/lib/serviceops/live-data";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const intake = await getCurrentIntakeRows();
  const tasks = await getCurrentTaskMappingRows();
  const analytics = buildAnalytics(intake.rows, tasks.rows);
  const stale = !!(intake.stale || tasks.stale);

  return (
    <AppFrame>
      <PageHeader
        title="Analytics"
        description={stale ? "Cache stale" : "Live cache"}
        actions={<ActionButton action="refresh_reports" label="Refresh reports" variant="primary" />}
      />

      <section className="panel analytics-command">
        <div className="analytics-rates">
          <div className="panel-header">
            <h3>Pipeline Conversion</h3>
            <span className="badge info">Snapshot</span>
          </div>
          <div className="rate-grid">
            <Rate label="Customer Resolution" value={analytics.rates.customerResolve} />
            <Rate label="Opportunity Creation" value={analytics.rates.opportunityCreate} />
            <Rate label="Sales Order Creation" value={analytics.rates.salesOrderCreate} />
            <Rate label="Review Load" value={analytics.rates.reviewLoad} tone="warn" />
          </div>
        </div>

        <div className="focus-panel">
          <div className="panel-header">
            <h3>Focus Now</h3>
            <Gauge size={16} />
          </div>
          <div className="focus-list">
            {analytics.efficiency.map((item) => (
              <Link className="focus-item" href={item.href || "#"} key={item.label}>
                <span className={`badge ${item.tone || ""}`}>{item.count}</span>
                <strong>{item.label}</strong>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="snapshot-grid">
        {analytics.topMetrics.map((item) => (
          <MetricLink item={item} key={item.label} />
        ))}
      </section>

      <section className="analytics-grid">
        <AnalyticsChartPanel title="Intake by Month" rows={analytics.monthly} />
        <AnalyticsChartPanel title="Pipeline State" rows={analytics.pipeline} />
        <AnalyticsChartPanel title="Top Cities" rows={analytics.cities} />
        <AnalyticsChartPanel title="Preferred Days" rows={analytics.preferredDays} />
        <AnalyticsChartPanel title="Work Order Status" rows={analytics.workOrderStatus} />
        <AnalyticsChartPanel title="Service Task Status" rows={analytics.taskStatus} />
        <AnalyticsChartPanel title="Opportunity Status" rows={analytics.opportunityStatus} />
        <AnalyticsChartPanel title="Asset Manufacturers" rows={analytics.manufacturers} />
      </section>

      <section className="dashboard-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-header">
            <h3>Report Inventory</h3>
            <RefreshCw size={15} />
          </div>
          <div className="quantity-list">
            {analytics.reportInventory.map((item) => (
              <div className="quantity-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.count.toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </div>

        <AnalyticsChartPanel title="Task Mapping Health" rows={analytics.taskMappingStatus} />
      </section>
    </AppFrame>
  );
}

function MetricLink({ item }: { item: QuantityRow }) {
  const body = (
    <>
      <span className={`badge ${item.tone || ""}`}>{item.label}</span>
      <strong>{item.count.toLocaleString()}</strong>
      <small>Open page <ArrowRight size={14} /></small>
    </>
  );

  return item.href
    ? <Link className="snapshot-tile" href={item.href}>{body}</Link>
    : <div className="snapshot-tile">{body}</div>;
}

function Rate({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rate-card">
      <span>{label}</span>
      <strong className={tone || ""}>{value}%</strong>
      <div className="mini-meter"><i style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}
