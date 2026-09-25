# Task Mapping — Current State

**Last updated:** 2026-09-25 (America/Toronto)

## Canonical project

- Repository: `consultpramodh/classicfireplace`
- Canonical branch: `task_mapping`
- Active rewrite: **Task Mapping V3**
- V3 source: `apps-script/tmv3-clean/`
- Bound V3 Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- V3 version: `3.11.14-legacy-assignment-parity-r1`
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

1. **Finish the Assignment Reconciliation feature as one feature-level gate** using exact legacy behavior across Install, Delivery, Service, and PreInspection.
2. Run assignment regression coverage plus a fresh current-data scan; individual Tasks are validation examples only, not separate project items.
3. Mark Assignment Reconciliation `DONE / VERIFIED` only when no unexpected assignment plans remain.
4. Move to the next feature gate: guarded CREATE/RECREATE behavior with authoritative read-back and Calendar backlink verification.
5. Run the final four-vertical V3 regression.
6. Only if those feature gates pass, perform controlled production cutover and verify the first scheduled cycle.

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

**Complete the Assignment Reconciliation feature.**

Feature acceptance:

- Install / Delivery use the legacy title-based assignee resolver; Aiden remains ignored.
- Install preserves unrelated/manual existing employees when adding the intended installer.
- Delivery follows the legacy delivery cleanup behavior and does not remove unrelated manual employees.
- Service derives the technician from the technician Calendar, removes `To Be Assigned` only after the intended technician is established, and removes only conflicting known Service technicians.
- PreInspection remains assigned to Pool 8; organizer/employee is `Requested By`, not `Assigned To`.
- A regression matrix and a fresh current-data scan must show no unexpected assignment mutations.

Task `16735` is retained only as live canary evidence that the Install assignment write path works and converges to `NO_CHANGE`.
