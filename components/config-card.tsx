import type { ReactNode } from "react";

export function ConfigCard({ title, value, children }: { title: string; value: ReactNode; children?: ReactNode }) {
  return (
    <section className="config-card">
      <span>{title}</span>
      <strong>{value}</strong>
      {children ? <p>{children}</p> : null}
    </section>
  );
}
