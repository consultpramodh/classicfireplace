# Classic Fireplace — Task Mapping

This `task_mapping` branch is the project ledger for the Classic Fireplace Task Mapping system: Install, Delivery, Service, and PreInspection.

## Start here

1. `PROJECT_OPERATING_RULES.md` — how this project must be changed, tested, deployed, verified, versioned, and recovered.
2. `PROJECT_CURRENT_STATE.md` — current known production/source state and blockers.
3. `PROJECT_CHECKPOINT.md` — latest continuation checkpoint and exact next action.
4. `docs/PREINSPECTION_FLOW.md` — current agreed PreInspection business workflow.
5. `TASK_MAPPING_SYNC_POLICY.md` — required Apps Script → GitHub synchronization procedure.

## Repository layout

- `apps-script/` — exact verified Apps Script source when a full current POST/read-back snapshot is available and safe to publish.
- `executions/` — one machine-readable record per verified deployment/release; `latest.json` points to the latest recorded release.
- `deployment-history/` — human-readable release/deployment history recovered from verified execution evidence.
- `docs/` — stable workflow/design documentation.
- `history/` — historical source manifests and legacy evidence that must not be mistaken for current production source.

## Current warning

The repository is public. Raw source snapshots must not include credentials, tokens, customer PII, or other private data. The current live Apps Script project has been proven by clasp execution logs to contain 36 files, but the exact current 36-file POST source is not presently available through the connected tools. Therefore `apps-script/` is intentionally marked incomplete rather than populated from a stale or partial source snapshot.

GitHub must never be described as production-parity until a full live pull, source verification, safe-content check, GitHub commit, and GitHub read-back all succeed.
