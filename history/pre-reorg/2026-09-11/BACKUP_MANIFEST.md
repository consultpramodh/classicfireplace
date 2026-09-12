# Task Mapping Pre-Reorganization Backup Manifest

**Baseline date:** 2026-09-11 (America/Toronto)

## Purpose

This file records the repository/ledger baseline immediately before architecture reorganization work began.

The canonical branch is now `task-mapping/main`, and the frozen grouped backup branch is:

`task-mapping/backup/task-mapping-r3.4.22-pre-reorg-20260911`

## Frozen repository point

- Canonical branch at freeze: legacy `task_mapping`
- Frozen source-ledger commit: `3732d857ec4683905e6bbc0123c0a71bde3e31b0`
- Frozen grouped backup branch head: `b23dafb5184f894dfb5c87aa9c516680bfe6ff95`
- Latest recorded production release at freeze: `R3.4.22_R30_REQUESTED_BY_ROUTER_FIX`
- Apps Script status in `executions/latest.json`: `DEPLOYED_SOURCE_VERIFIED`
- PreInspection Requested By runtime verification: PASS on the repaired R30 route for the three linked tasks on 2026-09-11.

## Important limitation

This is a **repository/ledger baseline**, not a certified exact 36-file Apps Script source backup.

At the time of the freeze:

- the live Apps Script project was known to contain 36 files;
- R3.4.22 had been pushed and POST-read-back verified;
- `apps-script/` still did not contain the exact current production source;
- `executions/latest.json` still recorded `githubSourceParity = PENDING_POST_ZIP_UPLOAD`.

Do not represent this baseline as exact production-source parity.

## Why the older August source was not promoted

The historical August snapshot is not the current production release and may contain sensitive/hard-coded operational values. It must remain historical evidence unless independently reviewed and intentionally used for comparison.

## Reorganization safety rule

Production Apps Script must not be changed merely to make the repository look cleaner.

Before broad physical source moves/deletions:

1. capture exact current live source;
2. verify 36-file inventory;
3. screen for secrets/PII/private data;
4. archive safe source under `apps-script/`;
5. prove GitHub read-back parity;
6. build complete caller/dependency/trigger/sheet/API/write inventory;
7. preserve rollback to this baseline and later verified source releases.

## Branch-history note

The original flat backup/reorganization branch names are superseded by the grouped `task-mapping/...` hierarchy. They may remain visible because the connected GitHub action set does not currently expose safe branch deletion. No active work should target those legacy refs.
