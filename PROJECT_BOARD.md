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
| Install / Delivery title-only assignee resolution | DONE / VERIFIED |
| Assignment Reconciliation — legacy parity across all verticals | TESTING / VERIFY |
| Install Task 16735 assignment canary (feature evidence) | DONE / VERIFIED |
| Read-only HEAD verification transport | DONE / VERIFIED |
| Existing-task guarded mutation path | BUILT / TESTING |
| CREATE path | BUILT / CANARY PENDING |
| RECREATE path | BUILT / CANARY PENDING |
| Calendar backlink verification | BUILT / FINAL CANARY PENDING |
| Automated production writes | BLOCKED BY RELEASE GATES |
| Final four-vertical regression | PLANNED |
| Production cutover | BACKLOG |
| Legacy retirement | BACKLOG |

## Closed verification issue

**Install Task 18678 assignment false-positive — CLOSED**

Fresh Step 7 now returns `NO_CHANGE`.

The previous `PATCH_ASSIGNMENTS` result came from narrative Calendar-description text and was not a real Striven assignment defect. V3 `3.11.9-assignee-title-only-r1` restores title-only assignment inference and preserves the existing Task assignment.

No Striven mutation was made.

## Current active gate

**Assignment Reconciliation feature**

The unit of work is the feature, not individual Task examples.

Current feature proof includes:
- title-only Install / Delivery assignee resolution;
- PreInspection Pool-8-only assignment semantics;
- Service technician-calendar semantics;
- guarded assignment write/read-back;
- Task `16735` live canary proving the Install write path.

Remaining work is feature-level regression and current-data validation across all four verticals.

## Required release sequence

`finish Assignment Reconciliation feature`
→ `assignment regression + current-data validation`
→ `CREATE / RECREATE feature verification`
→ `four-vertical regression`
→ `controlled production cutover`
→ `first scheduled-cycle verification`
→ `legacy retirement review`

## Current gate rule

Do not enable broad production writes while V3 remains `SHADOW_READ_ONLY`.

A gate is complete only after the intended external result is read back from the authoritative system and fresh reconciliation converges to the expected state.

## Most recent proof

- V3: `3.11.14-legacy-assignment-parity-r1`
- Task: `16735`
- Canary run: `36198082523`
- Post-write verification run: `36198236398`
- Evidence: `test-evidence/2026-09-25-tmv3-task-16735-assignment-canary-verified.md`
- Result: assignment `MATCH` → `NO_CHANGE`
