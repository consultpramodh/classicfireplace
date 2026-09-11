# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-11

## Production Version

`PreInspect R3.4.20a` remains the latest source release explicitly evidenced as remotely read back from Apps Script in the available release logs. The approved next patch is `R3.4.21_REQUESTED_BY_ORGANIZER_EMPLOYEE`, but it is **not yet deployed**.

## Active Objective

Deploy and runtime-verify the PreInspection-only Requested By change:

`Calendar organizer email → exact Striven Employee → RequestedBy.Type = employee`

Install, Delivery, and Service must remain unchanged.

## Prepared change

GitHub `task_mapping` now contains:

- `docs/PREINSPECTION_REQUESTED_BY_POLICY.md`;
- updated `docs/PREINSPECTION_FLOW.md`;
- `tools/patch-preinspect-requestedby-organizer.js`;
- `tools/deploy-preinspect-requestedby-organizer.ps1`.

The patcher is fail-closed and targets only:

- `35_PreInspect_Task_Review.js` — existing OPEN task Requested By reconciliation;
- `36_PreInspect_Task_Create.js` — new-task Requested By seed.

The new rule resolves the Calendar organizer email to exactly one Striven Employee, sends `RequestedBy = { Id: EmployeeId, Type: 'employee' }`, performs authoritative task read-back for existing-task reconciliation, and does not fall back to the customer contact.

## Current blocker

The connected tools cannot write directly to the bound Apps Script project. The live source must still be pulled/pushed through the already-authorized local `clasp` session. GitHub authentication is not involved; GitHub writes remain connector-driven from ChatGPT.

## Next exact action

From the local repository, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\deploy-preinspect-requestedby-organizer.ps1
```

The utility performs:

`clasp auth check → live PRE pull → two-file patch → syntax checks → freshness re-pull → bound-project push → POST pull → byte-for-byte verification → POST ZIP`

After it succeeds, upload the generated POST ZIP to this Task Mapping conversation. Then ChatGPT will immediately sync the exact verified POST source and execution record through the connected GitHub integration and read it back.

## Required runtime verification

After deployment, use one real PreInspection whose organizer resolves unambiguously to a Striven Employee and verify:

1. Task Type = 105;
2. Requested By ID equals the organizer Employee ID;
3. Requested By is an Employee rather than customer Contact;
4. Customer/Location/Pool/dates/854/Description behavior is unchanged;
5. Install/Delivery/Service behavior is unaffected.

## Other open items

- production GitHub source parity still pending;
- overlapping report-refresh cadence reduction is reviewed but not deployed;
- PreInspect scheduler safety remains under review;
- Field 854 and new-location paths still require final controlled proofs;
- DONE → Install Calendar and DONE → Sales Order handoffs remain downstream work.
