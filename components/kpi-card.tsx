import type { ReactNode } from "react";

export function KpiCard({ label, value, tone = "neutral", children }: { label: string; value: ReactNode; tone?: "neutral" | "gold" | "danger" | "green"; children?: ReactNode }) {
  return (
    <section className={`ops-kpi ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {children ? <small>{children}</small> : null}
    </section>
  );
}
