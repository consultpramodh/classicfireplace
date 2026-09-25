# Task Mapping — Current State

**Last updated:** 2026-09-25 (America/Toronto)

## Canonical project

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Active rewrite: **Task Mapping V3**
- V3 source: `apps-script/tmv3-clean/`
- Bound V3 Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- V3 version: `3.11.9-assignee-title-only-r1`
- Execution stage: `7`
- Global mode: `SHADOW_READ_ONLY`

The four verticals remain Install, Delivery, Service, and PreInspection.

## Current V3 architecture

`CALENDAR → NORMALIZE/ELIGIBILITY → BUSINESS ANCHOR → IDENTITY → TASK RESOLUTION → TASK DECISION → RECONCILIATION → EXECUTE → READ-BACK VERIFY → CALENDAR LINK VERIFY → COMPLETE`

V3 remains consolidated under the existing module set. Do **not** add Step 8/9/10 Apps Script files.

## Current safety state

V3 is not in production-write mode.

- Global mode: `SHADOW_READ_ONLY`
- Automation writes: disabled
- Scheduled Stage-7 business writes: gated
- CREATE/RECREATE production cutover: not approved
- Legacy production behavior remains the rollback/business-continuity path

## Verified fixes — 2026-09-25

### Canonical PM Task schedule

**VERIFIED**

For Install Task `18678`, Striven v2 exposed a PM appointment as an AM schedule. V3 now falls back to canonical Striven v1 `DesiredStartDate / DesiredEndDate` when v2 disagrees with Calendar.

Verified:

- Calendar start/end: `MATCH / MATCH`
- source: `V1_DESIRED_START_END`
- incorrect date patch removed
- evidence: `test-evidence/2026-09-25-tmv3-canonical-pm-schedule-verified.md`

### Install / Delivery assignee inference

**VERIFIED**

The apparent Task `18678` assignment mismatch was a V3 false positive. V3 was incorrectly treating narrative Calendar-description text as assignment evidence.

Release `3.11.9-assignee-title-only-r1` restores the canonical rule:

- Install / Delivery assignment names come from the **Calendar event title only**;
- description notes do not create assignments;
- normalized whole-token / whole-phrase matching is used;
- Aiden remains ignored;
- Service and PreInspection keep their separate assignment rules.

Fresh live Step 7 for Task `18678` now returns:

- Customer: `MATCH`
- Order: `MATCH`
- Location: `MATCH`
- Requested By: `MATCH`
- Start: `MATCH`
- End: `MATCH`
- Desired assignment: none
- Existing assignment: preserved
- Assignment check: `N/A`
- Final plan: `NO_CHANGE`
- Blocker: none
- Read status: `FRESH_TASK_GET`

No Striven assignment mutation was made.

Evidence:

- GitHub Actions run: `36183055729`
- artifact: `10885545480`
- file: `test-evidence/2026-09-25-tmv3-title-only-assignee-verified.md`

## Read-only runtime verifier

Read-only V3 verification now reuses the Apps Script HEAD/test web-app deployment through the authenticated `/dev` endpoint.

This removes the previous need to create one temporary Apps Script version/deployment for every read-only probe and avoids the observed `RESOURCE_EXHAUSTED` deployment path.

The runner still restores the exact pre-run source and verifies source-head hash parity after execution.

## Write-path readiness

Existing-task reconciliation is implemented with guarded fresh-read / fresh-plan / read-back verification.

CREATE/RECREATE implementation is present with duplicate prevention, durable Task-ID capture, read-back checks, Calendar backlink handling, and PreInspection-specific safety rules.

Production readiness is not yet proven until controlled live canaries and the final regression pass complete.

## Remaining critical path

1. Identify and preview one deterministic `CREATE_TASK` candidate from a fresh read-only Step-7 run.
2. After exact transaction approval, execute one controlled CREATE canary with Striven read-back and Calendar backlink verification.
3. Identify and execute one controlled RECREATE canary under the same guarded procedure.
4. Run final four-vertical V3 regression.
5. Reconcile remaining REVIEW/patch cases.
6. Only if those gates pass, perform a controlled production cutover from `SHADOW_READ_ONLY`.
7. Verify the first scheduled production cycle before considering legacy retirement.

## Current completion classification

| Area | Status |
|---|---|
| V3 architecture | BUILT |
| Stage-7 reconciliation engine | BUILT / ACTIVE VERIFICATION |
| Canonical PM schedule fallback | VERIFIED |
| Title-only Install/Delivery assignment resolution | VERIFIED |
| Existing-task guarded mutation path | BUILT |
| CREATE path | BUILT / LIVE CANARY PENDING |
| RECREATE path | BUILT / LIVE CANARY PENDING |
| Calendar backlink path | BUILT / FINAL CANARY PENDING |
| Read-only runtime verification transport | VERIFIED |
| Automation production writes | GATED |
| Final four-vertical regression | PENDING |
| Production cutover | NOT APPROVED |
| Legacy retirement | NOT APPROVED |

## Exact next action

**Run a fresh read-only Step-7 reconciliation and select the safest deterministic `CREATE_TASK` candidate.**

Do not create anything until the exact customer/location/order/task payload and duplicate-prevention evidence are previewed and bound to the canary transaction.
