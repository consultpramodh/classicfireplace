# Task Mapping — Current State

**Last updated:** 2026-09-25 (America/Toronto)

## Canonical project

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Active rewrite: **Task Mapping V3**
- V3 source: `apps-script/tmv3-clean/`
- Bound V3 Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- V3 version: `3.11.8-v1-canonical-schedule-r1`
- Execution stage: `7`
- Global mode: `SHADOW_READ_ONLY`

The four verticals remain:

1. Install
2. Delivery
3. Service
4. PreInspection

## Current V3 architecture

Canonical runtime order:

`CALENDAR → NORMALIZE/ELIGIBILITY → BUSINESS ANCHOR → IDENTITY → TASK RESOLUTION → TASK DECISION → RECONCILIATION → EXECUTE → READ-BACK VERIFY → CALENDAR LINK VERIFY → COMPLETE`

V3 source is consolidated under the existing module set. Do **not** add Step 8/9/10 Apps Script files. Extend or consolidate existing modules.

## Current safety state

V3 is **not in production-write mode**.

- Global mode: `SHADOW_READ_ONLY`
- Automation writes: disabled
- Scheduled Stage-7 business writes: gated
- CREATE/RECREATE production cutover: not approved
- Legacy production behavior remains the rollback/business continuity path
- Manual-write policy flags cannot elevate the project while the global mode remains `SHADOW_READ_ONLY`

## Latest verified result — PM schedule defect

**Status: VERIFIED FIXED**

Evidence:

- V3 release: `3.11.8-v1-canonical-schedule-r1`
- GitHub Actions run: `36180539726`
- Evidence artifact: `10884600388`
- Evidence file: `test-evidence/2026-09-25-tmv3-canonical-pm-schedule-verified.md`
- Install Task: `18678`

Verified behavior:

- Calendar schedule: 2:00 PM–5:00 PM
- Striven v2 exposed the same appointment as 2:00 AM–5:00 AM
- V3 detected the v2 disagreement
- V3 read canonical Striven v1 `DesiredStartDate / DesiredEndDate`
- Canonical v1 schedule matched Calendar at 2:00 PM–5:00 PM
- `Start Check = MATCH`
- `End Check = MATCH`
- schedule source = `V1_DESIRED_START_END`
- Step 7 no longer proposes a date patch
- source-head parity after the temporary verification execution: PASS
- temporary verification deployment: deleted
- no Striven or Calendar business mutation was executed

## Current active defect

The same fresh Step-7 read now resolves the schedule correctly but still returns:

`PATCH_ASSIGNMENTS`

Therefore the PM date defect is closed. The **next active defect is the assignment mismatch for Task 18678**.

This assignment issue must be handled independently from the now-verified schedule logic.

## Write-path readiness

Existing-task reconciliation is implemented with guarded fresh-read / fresh-plan / read-back verification.

CREATE/RECREATE implementation is present with duplicate prevention, durable Task-ID capture, read-back checks, Calendar backlink handling, and PreInspection-specific safety rules.

However, production readiness is **not yet proven** until controlled live canaries and the final regression pass are complete.

## Remaining critical path

1. Resolve and verify the Task 18678 assignment mismatch.
2. Run one controlled CREATE canary with full Striven read-back and Calendar backlink verification.
3. Run one controlled RECREATE canary with full Striven read-back and Calendar backlink verification.
4. Run final four-vertical V3 regression using the current source.
5. Reconcile any remaining REVIEW/patch cases.
6. Only if those gates pass, perform a controlled production cutover from `SHADOW_READ_ONLY`.
7. Verify the first scheduled production cycle before considering legacy retirement.

## Current completion classification

| Area | Status |
|---|---|
| V3 architecture | BUILT |
| Stage-7 reconciliation engine | BUILT / ACTIVE VERIFICATION |
| Canonical PM schedule fallback | VERIFIED |
| Existing-task guarded mutation path | BUILT |
| CREATE path | BUILT / LIVE CANARY PENDING |
| RECREATE path | BUILT / LIVE CANARY PENDING |
| Calendar backlink path | BUILT / FINAL CANARY PENDING |
| Automation production writes | GATED |
| Final four-vertical regression | PENDING |
| Production cutover | NOT APPROVED |
| Legacy retirement | NOT APPROVED |

## Exact next action

**Fix and verify the Task 18678 assignment mismatch without changing the verified schedule.**

The acceptance condition is:

- schedule remains `MATCH / MATCH`;
- desired assignment is deterministic;
- assignment mutation, if authorized in a controlled canary, reads back correctly;
- fresh Step-7 plan converges to `NO_CHANGE`;
- no unrelated fields are changed.
