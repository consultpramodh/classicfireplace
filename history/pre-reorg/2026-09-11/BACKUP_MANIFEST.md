# Task Mapping Pre-Reorganization Backup Manifest

**Baseline date:** 2026-09-11 (America/Toronto)

## Purpose

This file records the repository/ledger baseline immediately before architecture reorganization work began.

It is stored inside the canonical `task_mapping` branch so future work does not depend on a separate backup branch.

## Frozen repository point

- Canonical branch at freeze: `task_mapping`
- Frozen source-ledger commit: `3732d857ec4683905e6bbc0123c0a71bde3e31b0`
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

Reorganization may change repository documentation, architecture contracts, tests, adapters, and later source ownership only through guarded steps.

Production Apps Script must not be changed merely to make the repository look cleaner.

Before broad physical source moves/deletions:

1. capture exact current live source;
2. verify 36-file inventory;
3. screen for secrets/PII/private data;
4. archive safe source under `apps-script/`;
5. prove GitHub read-back parity;
6. build complete caller/dependency/trigger/sheet/API/write inventory;
7. preserve rollback to this baseline and later verified source releases.

## Historical side branches

Temporary branches created during the first reorganization pass may remain in GitHub history, but no active project material should depend on them. Their unique content has been consolidated into `task_mapping`.
