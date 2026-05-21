import type { ServiceRequest } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";

export function ReviewCard({ request, onAction }: { request: ServiceRequest; onAction: (action: string) => void }) {
  const issues = request.reviewIssues.length ? request.reviewIssues : [{ reason: "AI_CLASSIFICATION_LOW_CONFIDENCE" as const, severity: "medium" as const, suggestedAction: "Review before continuing.", aiExplanation: request.ai.summary }];

  return (
    <article className="review-card">
      <div className="review-card-head">
        <div>
          <span>{request.id}</span>
          <h3>{request.customerName}</h3>
        </div>
        <StatusBadge status={request.state} />
      </div>
      {issues.map((issue) => (
        <div className="review-issue" key={issue.reason}>
          <span className={`severity ${issue.severity}`}>{issue.severity}</span>
          <strong>{issue.reason}</strong>
          <p>{issue.aiExplanation}</p>
          <small>{issue.suggestedAction}</small>
        </div>
      ))}
      <div className="ops-actions">
        {["Resolve", "Retry Step", "Override", "Close"].map((label) => (
          <button className="btn" key={label} type="button" onClick={() => onAction(label)}>{label}</button>
        ))}
      </div>
    </article>
  );
}
