import type { AuditEntry } from "@/lib/types";

export function Timeline({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="timeline">
      {entries.map((entry, index) => (
        <article key={`${entry.at}-${index}`}>
          <time>{new Intl.DateTimeFormat("en-CA", { month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" }).format(new Date(entry.at))}</time>
          <strong>{entry.action}</strong>
          <span>{entry.actor}</span>
          <p>{entry.note}</p>
        </article>
      ))}
    </div>
  );
}
