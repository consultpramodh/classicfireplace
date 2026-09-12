# Classic Fireplace — Task Mapping

`task_mapping` is the **single canonical GitHub branch** for the Classic Fireplace Task Mapping system: Install, Delivery, Service, and PreInspection.

All durable project material belongs inside this branch. Backup and architecture records are organized as folders, not permanent parallel branches.

Production Apps Script is not changed merely because repository documentation or architecture is reorganized here.

## Start here

1. `PROJECT_CURRENT_STATE.md` — latest verified production/source state, active risks, and reorganization status.
2. `PROJECT_CHECKPOINT.md` — exact continuation point and next action.
3. `PROJECT_OPERATING_RULES.md` — mandatory change, test, deployment, verification, and recovery rules.
4. `docs/README.md` — documentation index.
5. `docs/REPOSITORY_STRUCTURE.md` — single-branch folder map and branch-retirement plan.
6. `docs/architecture/README.md` — architecture/reorganization index.
7. `docs/architecture/PROCESS_CONTRACT_MATRIX.md` — per-workflow guardrails, endpoints, retry states, and write/read-back contracts.
8. `docs/architecture/GAP_REGISTER.md` — prioritized failure modes and open proof gaps.
9. `docs/workflows/preinspection/FLOW.md` — agreed PreInspection business workflow.
10. `docs/policies/API_REFRESH_POLICY.md` — API/report-refresh analysis and target cadence.
11. `TASK_MAPPING_SYNC_POLICY.md` — required Apps Script → GitHub synchronization procedure.

## Repository layout

- `apps-script/` — exact verified Apps Script source only when full production-source parity has been proven and the source is safe to publish.
- `backups/` — backup manifests and rollback references previously spread across backup branches.
- `docs/architecture/` — target architecture, process contracts, endpoint definitions, gap register, and staged migration plan.
- `docs/policies/` — cross-workflow policies such as API cadence and versioning/release standards.
- `docs/workflows/` — workflow-specific business rules and process documentation.
- `executions/` — machine-readable verified deployment/release records; `latest.json` is the latest recorded release.
- `deployment-history/` — human-readable release/deployment history.
- `history/releases/` — release-specific historical notes.
- `history/source-snapshots/` — historical source evidence that must not be mistaken for current production source.
- `tools/` — operator utilities used to capture, inspect, patch, or verify project state.
- `.github/workflows/` — repository checks.

## Current production release

The latest recorded source release is **R3.4.22 — R30 Requested By Router Fix**.

The repaired PreInspection Requested By route has been runtime-verified on the three linked PreInspection tasks for 2026-09-11, and the final read-only audit recorded 3 PASS / 0 FAIL / 0 REVIEW for existing linked tasks.

See `executions/latest.json` for the authoritative release ledger.

## Source-parity warning

This repository is public.

Raw Apps Script source must not be archived here until it is screened for credentials, tokens, customer PII, private operational data, and unsafe hard-coded endpoints.

The live Apps Script project is known to contain 36 files, and R3.4.22 was source-pushed and POST-read-back verified. However, the exact current 36-file POST source is still not archived under `apps-script/`. Therefore GitHub production-source parity remains pending.

Do not reconstruct current production source from an older snapshot and label it current.

## Reorganization rule

Reorganization is a staged, compatibility-preserving migration—not a rewrite.

Until exact live-source parity and a complete caller/dependency inventory exist:

- do not delete or rename production functions/files merely for cleanliness;
- preserve menus, triggers, sheet names, Calendar IDs, task-type rules, assignment rules, and public entrypoints;
- document one canonical owner for each responsibility;
- separate resolution/matching/planning from mutation;
- require explicit endpoint states and read-back verification for material writes;
- fail closed on ambiguous relationships;
- never blindly retry an uncertain CREATE.

The canonical architecture and workflow-specific guardrails are in `docs/architecture/`.
