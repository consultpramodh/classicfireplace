# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-25 (America/Toronto)

## Canonical branch

`task_mapping` is the single canonical Task Mapping branch.

## Active rewrite

- System: **Task Mapping V3**
- Source: `apps-script/tmv3-clean/`
- V3 version: `3.11.8-v1-canonical-schedule-r1`
- Execution stage: `7`
- Bound Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Mode: `SHADOW_READ_ONLY`

V3 covers Install, Delivery, Service, PreInspection, and shared resolution/reconciliation/verification modules.

## Latest verified checkpoint

**Canonical PM schedule fallback: PASS**

GitHub Actions run: `36180539726`

Evidence artifact: `10884600388`

Evidence file:

`test-evidence/2026-09-25-tmv3-canonical-pm-schedule-verified.md`

Verified case:

- Install Task `18678`
- Calendar schedule: 2:00 PM–5:00 PM
- Striven v2 exposed: 2:00 AM–5:00 AM
- canonical Striven v1 exposed: 2:00 PM–5:00 PM
- V3 fallback source: `V1_DESIRED_START_END`
- `Start Check = MATCH`
- `End Check = MATCH`
- Step 7 removed the incorrect date-patch requirement
- global write gate remained read-only
- source parity after temporary execution: PASS
- temporary verification deployment deleted

## Current unresolved item

Fresh Step 7 for Task `18678` now returns:

`PATCH_ASSIGNMENTS`

The schedule problem is closed. The assignment mismatch is the next active issue.

## Current safety state

No broad V3 production cutover has occurred.

- `SHADOW_READ_ONLY` remains active.
- Automation business writes remain disabled.
- CREATE/RECREATE production use remains gated.
- A controlled write must be previewed, executed, read back, and reconciled before it can count as verified.

## Remaining release gates

1. Resolve and verify Task 18678 assignment.
2. Controlled CREATE canary.
3. Controlled RECREATE canary.
4. Final four-vertical regression.
5. Controlled production cutover.
6. Verify first scheduled production cycle.
7. Only then evaluate legacy retirement.

## Next exact action

**Assignment reconciliation for Install Task 18678.**

Acceptance criteria:

- current verified date/time remains unchanged;
- desired assignee is derived deterministically from the Calendar event;
- any canary mutation is limited to assignment;
- fresh Striven read-back matches the desired assignment;
- fresh Step-7 plan converges to `NO_CHANGE`;
- no unrelated mutation occurs.
