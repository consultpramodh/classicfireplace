export function EligibilityChecklist({ checks }: { checks: { label: string; passed: boolean }[] }) {
  return (
    <div className="eligibility-list">
      {checks.map((check) => (
        <div className={check.passed ? "eligibility-row passed" : "eligibility-row"} key={check.label}>
          <span>{check.passed ? "✓" : "!"}</span>
          <strong>{check.label}</strong>
        </div>
      ))}
    </div>
  );
}
