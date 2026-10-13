# CF Tasks — V3 ACTIVE — Clean Rebuild

`task_mapping` is the **single canonical GitHub branch** for the Classic Fireplace Task Mapping system: Install, Delivery, Service, and PreInspection.

All durable project material belongs inside this branch. Backup and architecture records are organized as folders, not permanent parallel branches.

Production Apps Script is not changed merely because repository documentation or architecture is reorganized here.

## Start here

1. `PROJECT_CURRENT_STATE.md` — latest verified production/source state, active risks, and reorganization status.
2. `PROJECT_CHECKPOINT.md` — exact continuation point and next action.
3. `PROJECT_OPERATING_RULES.md` — mandatory change, test, deployment, verification, and recovery rules.
4. `docs/README.md` — documentation index.
5. `docs/REPOSITORY_STRUCTURE.md` — single-branch folder map and branch-retirement plan.
6. `docs/workflows/README.md` — project-wide workflow index covering Install, Delivery, Service, and PreInspection.
7. `docs/workflows/WORKFLOW_COVERAGE_MATRIX.md` — confirms equal workflow coverage and pending live-source inventory work.
8. `docs/architecture/README.md` — architecture/reorganization index.
9. `docs/architecture/PROCESS_CONTRACT_MATRIX.md` — shared and per-workflow guardrails, endpoints, retry states, and write/read-back contracts.
10. `docs/policies/API_REFRESH_POLICY.md` — API/report-refresh analysis and target cadence.
11. `TASK_MAPPING_SYNC_POLICY.md` — required Apps Script → GitHub synchronization procedure.

## Four workflow domains

The repository maintains dedicated documentation for all four workflows:

- `docs/workflows/install/`
- `docs/workflows/delivery/`
- `docs/workflows/service/`
- `docs/workflows/preinspection/`

Shared/common logic belongs in `docs/architecture/`. A refactor affecting shared code is not accepted until every affected workflow contract is checked.

## Repository layout

- `apps-script/` — exact verified Apps Script source only when full production-source parity has been proven and the source is safe to publish.
- `backups/` — project-wide backup manifests and rollback references previously spread across backup branches.
- `docs/architecture/` — target architecture, process contracts, endpoint definitions, gap register, and staged migration plan.
- `docs/policies/` — cross-workflow policies such as API cadence and versioning/release standards.
- `docs/workflows/` — workflow-specific business rules and process documentation for all four workflows.
- `executions/` — machine-readable verified deployment/release records; `latest.json` is the latest recorded release.
- `deployment-history/` — human-readable release/deployment history.
- `history/releases/` — release-specific historical notes.
- `history/source-snapshots/` — historical source evidence that must not be mistaken for current production source.
- `tools/` — operator utilities used to capture, inspect, patch, or verify project state.
- `.github/workflows/` — repository checks.

## Current active V3 release

**3.11.81-task-first-authoritative-audit-r1**, source `apps-script/tmv3-clean/`, 22 live files source/hash verified. The bound project is `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`.

The existing Service/Delivery task relationship worker is live with one candidate per 60-minute interval and required ownership/read-back checks. General task creation, schedule, assignment and Calendar write permissions remain gated. This bounded activation is not a claim of complete four-vertical production readiness.

Read `PROJECT_CHECKPOINT.md` and `executions/latest.json` for current verification and rollback evidence. Older R3/R30/legacy project references are historical and must not be used as the active V3 deployment target.

## Source publication

This repository is public. Preserve credential/customer-data screening for every publication. Current active V3 source parity is verified; unrelated legacy source snapshots do not establish parity for the active project.

## Reorganization rule

Reorganization is a staged, compatibility-preserving migration—not a rewrite.

Until exact live-source parity and a complete caller/dependency inventory exist:

- do not delete or rename production functions/files merely for cleanliness;
- preserve menus, triggers, sheet names, Calendar IDs, task-type rules, assignment rules, and public entrypoints;
- preserve Install, Delivery, Service, and PreInspection-specific behavior;
- document one canonical owner for each responsibility;
- separate resolution/matching/planning from mutation;
- require explicit endpoint states and read-back verification for material writes;
- fail closed on ambiguous relationships;
- never blindly retry an uncertain CREATE.

The canonical architecture and workflow-specific guardrails are in `docs/architecture/` and `docs/workflows/`.
