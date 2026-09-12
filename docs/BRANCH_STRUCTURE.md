# Task Mapping Branch Structure

## Canonical hierarchy

Use the following branch namespace for all Task Mapping work:

- `task-mapping/main` — canonical current project state, execution ledger, verified documentation, and future production-source archive.
- `task-mapping/reorg/task-mapping-architecture-20260911` — current architecture/reorganization work branch created from canonical main.
- `task-mapping/backup/task-mapping-r3.4.22-pre-reorg-20260911` — frozen pre-reorganization rollback/backup point.

## Rules

1. New verified project state ultimately lands in `task-mapping/main`.
2. Refactors/reorganization start from current `task-mapping/main` under `task-mapping/reorg/...`.
3. Frozen backups use `task-mapping/backup/...` and are not modified after capture except for metadata-only correction when necessary.
4. Production Apps Script writes are never triggered merely by repository branch reorganization.
5. Exact Apps Script source is published only after live pull/read-back verification and sensitive-content screening.
6. Legacy flat branch names are historical aliases only and must not receive new work.

## Superseded branch refs

These branch names are superseded:

- `task_mapping`
- `reorg/task-mapping-architecture-20260911`
- `backup/task-mapping-r3.4.22-pre-reorg-20260911`

They may remain visible in GitHub because the connected GitHub action set currently exposes branch creation/update but not safe branch deletion. Their existence does not make them canonical.

## Current workflow

For architecture changes:

`task-mapping/main → task-mapping/reorg/... → verification → reconcile into task-mapping/main → GitHub read-back`

For production code releases:

`live Apps Script pull → guarded change/test/push → POST read-back → runtime verification → sync verified source/evidence to task-mapping/main → GitHub read-back`
