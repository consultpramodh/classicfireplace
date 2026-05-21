"use client";

import { useState } from "react";
import type { QuantityRow } from "@/lib/serviceops/analytics";

export function AnalyticsChartPanel({ title, rows }: { title: string; rows: QuantityRow[] }) {
  const [showShare, setShowShare] = useState(false);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return (
    <section className="panel chart-panel compact-chart">
      <div className="panel-header">
        <h3>{title}</h3>
        <span className="chart-mode">{showShare ? "%" : "#"}</span>
      </div>
      <div className="bar-list">
        {rows.length ? rows.map((row, index) => {
          const share = total ? Math.round((row.count / total) * 100) : 0;
          const width = showShare ? share : (row.count / max) * 100;
          const display = showShare ? `${share}%` : row.count.toLocaleString();

          return (
            <div
              className="bar-row"
              key={row.label}
              style={{ ["--bar-color" as string]: pastelForIndex(index) }}
            >
              <div className="bar-label">
                <span>{row.label}</span>
                <button
                  type="button"
                  className="bar-value"
                  onClick={() => setShowShare((value) => !value)}
                  title="Toggle number and percentage share"
                >
                  {display}
                </button>
              </div>
              <div className="bar-track"><i style={{ width: `${Math.max(4, width)}%` }} /></div>
            </div>
          );
        }) : <div className="empty">No data in this snapshot.</div>}
      </div>
    </section>
  );
}

function pastelForIndex(index: number) {
  const colors = [
    "#a7d8c9",
    "#f4c7ab",
    "#b9c7f2",
    "#f2d58a",
    "#d6b7e8",
    "#a9d4f2",
    "#f0b8c5",
    "#c7df9e"
  ];

  return colors[index % colors.length];
}
