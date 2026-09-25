# Task Mapping & Field Operations — Project Board

Canonical tracker: issue #23

## Status model

`IDEA` → `GOOD TO HAVE` → `BACKLOG` → `PLANNED` → `IN PROGRESS` → `BLOCKED` → `TESTING / VERIFY` → `READY TO RELEASE` → `LIVE / MONITORING` → `DONE / ARCHIVED`

## Stable / live baseline

| Feature | Status |
|---|---|
| Legacy Install routing/workflow | LIVE / MONITORING |
| Legacy Delivery routing/workflow | LIVE / MONITORING |
| Legacy Service routing/workflow | LIVE / MONITORING |
| PreInspection workflow | LIVE / MONITORING |
| Guarded GitHub / clasp deployment + read-back pipeline | LIVE / MONITORING |

## V3 current state

| Feature | Status |
|---|---|
| V3 architecture / module layout | DONE |
| Calendar → decision stages | BUILT |
| Step 7 reconciliation | TESTING / VERIFY |
| Canonical v1 schedule fallback for v2 PM defect | DONE / VERIFIED |
| Existing-task guarded mutation path | BUILT / TESTING |
| CREATE path | BUILT / CANARY PENDING |
| RECREATE path | BUILT / CANARY PENDING |
| Calendar backlink verification | BUILT / FINAL CANARY PENDING |
| Automated production writes | BLOCKED BY RELEASE GATES |
| Final four-vertical regression | PLANNED |
| Production cutover | BACKLOG |
| Legacy retirement | BACKLOG |

## Current active issue

**Install Task 18678 assignment mismatch**

Latest verified Step-7 state:

- schedule: verified correct through canonical v1 fallback;
- date patch: no longer required;
- remaining plan: `PATCH_ASSIGNMENTS`.

This is now the first item on the critical path.

## Required release sequence

`Task 18678 assignment verification`
→ `CREATE canary`
→ `RECREATE canary`
→ `four-vertical regression`
→ `controlled production cutover`
→ `first scheduled-cycle verification`
→ `legacy retirement review`

## Current gate

Do not enable broad production writes while V3 remains `SHADOW_READ_ONLY`.

A gate is complete only after the intended result is read back from the authoritative system and fresh reconciliation converges to the expected state.

## Most recent proof

- V3: `3.11.8-v1-canonical-schedule-r1`
- GitHub Actions run: `36180539726`
- Evidence artifact: `10884600388`
- Evidence: `test-evidence/2026-09-25-tmv3-canonical-pm-schedule-verified.md`
- Result: PM schedule fallback **VERIFIED**
