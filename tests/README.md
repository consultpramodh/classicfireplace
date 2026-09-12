# Task Mapping Regression Tests

This area defines pre-push regression coverage for the four Task Mapping workflows and shared modules.

## Workflow suites

- `install/`
- `delivery/`
- `service/`
- `preinspection/`
- `shared/`

## Rule

A production promotion cannot rely on one workflow passing if shared code changed. Every workflow that calls an affected shared module must either pass its relevant regression suite or be explicitly documented as unaffected with evidence.

Tests should prefer deterministic fixtures, read-only previews, and isolated TEST writes with authoritative read-back.

## Minimum outcome categories

Tests should cover successful no-change/update paths plus expected failure/defer states where relevant:

- `VERIFIED_COMPLETE`
- `NO_CHANGE_VERIFIED`
- `REVIEW_REQUIRED`
- `BLOCKED`
- `DEFERRED_RETRY`
- `PARTIAL_FAILURE`
- `UNCERTAIN_WRITE`
- `TERMINAL_SKIP`

## Evidence

Every executed test run should record:

- candidate version/commit;
- environment;
- workflow;
- test case;
- inputs/fixture IDs where safe;
- expected result;
- actual result;
- read-back result when writes occurred;
- PASS/FAIL/REVIEW;
- timestamp.

Store durable summaries under `test-evidence/` without exposing secrets or customer PII.