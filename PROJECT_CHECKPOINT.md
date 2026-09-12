# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-11 (America/Toronto)

## Canonical GitHub home

All active Task Mapping project material is now being consolidated inside the `task_mapping` branch.

The temporary backup/reorganization branches remain historical markers, but their unique planning/backup content is duplicated into `task_mapping` so no active work depends on those side branches.

## Production Version

Latest recorded production source release:

`R3.4.22 — R30 Requested By Router Fix`

Business rule:

`Calendar organizer email → exact Striven Employee → RequestedBy.Type = employee`

Scope is **PreInspection only**. Install, Delivery, and Service Requested By behavior is unchanged.

## Verified source deployment

R3.4.22 source deployment is recorded as `DEPLOYED_SOURCE_VERIFIED`.

Recorded verification includes:

1. fresh live source pull;
2. 36-file pre-pull count;
3. one-file R30 router fix in `35_PreInspect_Task_Review.js`;
4. syntax check PASS;
5. freshness guard PASS;
6. push to the existing Apps Script project;
7. 36-file post-pull count;
8. POST SHA read-back PASS.

## Verified runtime behavior

The repaired production R30 route was runtime-verified on all three linked PreInspection tasks for 2026-09-11:

- Task 18379 → Spencer Bambek Employee 20;
- Task 18241 → Warren Jennings Employee 54;
- Task 18362 → Adam Stokes Employee 31.

All used `CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE`, and final read-back showed `RequestedBy.Type=employee`.

The final read-only audit recorded 3 PASS / 0 FAIL / 0 REVIEW for the three existing linked tasks.

### Remaining scheduler proof

After the next normal scheduled PreInspection batch, rerun the read-only Requested By audit. If the same linked tasks remain correct, the historical scheduled-route customer-contact regression can be considered scheduler-verified closed.

## GitHub source parity

The current repository still does **not** contain the exact current 36-file production Apps Script source under `apps-script/`.

Therefore:

- project ledger parity: current;
- architecture/contracts: current;
- production Apps Script source parity: **PENDING**.

Do not physically reorganize production code using the August historical snapshot or a reconstructed approximation.

## Reorganization checkpoint

Repository-only reorganization has begun, with no production Apps Script mutation.

The canonical planning material is now organized under:

`docs/architecture/`

with:

- `README.md`
- `REORGANIZATION_PLAN.md`
- `PROCESS_CONTRACT_MATRIX.md`
- `GAP_REGISTER.md`

The frozen pre-reorganization repository baseline is recorded under:

`history/pre-reorg/2026-09-11/BACKUP_MANIFEST.md`

### Architecture direction

`SOURCE → NORMALIZE → RESOLVE → MATCH → CLASSIFY → PLAN → EXECUTE → VERIFY → LINK/HANDOFF → ENDPOINT`

The migration is compatibility-preserving. Existing public/menu/trigger entrypoints remain until replacements are proven.

## Exact next action

**Capture the exact current 36-file live Apps Script source, screen it for secrets/PII, archive it under `apps-script/`, and verify GitHub read-back parity.**

Then build the complete production inventory:

- every file;
- every public/private function;
- caller/callee graph;
- menus and trigger entrypoints;
- sheets read/written and header expectations;
- Calendar reads/writes;
- Striven reports/API endpoints and mutations;
- relationship/matching rules;
- assignment rules;
- create/recreate/recovery rules;
- kill switches/caps/business-hour gates;
- fingerprints/idempotency rules;
- compatibility aliases;
- known-good and known-bad regression cases.

Classify every function as:

`CANONICAL / ADAPTER / LEGACY-USED / LEGACY-UNUSED / UNKNOWN`

Only after that inventory is grounded in the exact live source should physical source reorganization begin.
