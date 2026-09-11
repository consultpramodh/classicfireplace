# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-11

## Production Version

`PreInspect R3.4.21c` is now the latest source release explicitly pushed to the live Apps Script project and POST-read-back verified.

Business change:

`Calendar organizer email → exact Striven Employee → RequestedBy.Type = employee`

Scope is **PreInspection only**. Install, Delivery, and Service Requested By behavior is unchanged.

## Verified deployment result

The R3.4.21c auto-update completed successfully with `DEPLOYED_SOURCE_VERIFIED`.

Verified sequence:

1. clasp authorization PASS;
2. package self-test PASS;
3. known Task Mapping Script ID used;
4. exact live PRE source pulled;
5. exactly two PreInspect files patched;
6. syntax checks PASS;
7. FRESH pull completed immediately before push;
8. 36 files pushed to the existing Apps Script project;
9. POST pull completed;
10. full-project SHA verification PASS.

Changed files:

- `35_PreInspect_Task_Review.js`
- `36_PreInspect_Task_Create.js`

The deployment evidence is recorded in:

- `executions/2026-09-11-r3.4.21c-deployed.json`
- `executions/latest.json`

## Runtime verification still required

Source deployment is proven. Business behavior is not yet fully runtime-proven.

Use one real PreInspection whose Google Calendar organizer resolves unambiguously to a Striven Employee and verify:

1. Task Type = 105;
2. Requested By ID equals the organizer's Striven Employee ID;
3. Requested By entity/type is Employee;
4. no customer-contact fallback occurred;
5. Customer, Location, Pool 8, dates, field 854 and technician-owned Description behavior remain correct;
6. Install / Delivery / Service remain unaffected.

## GitHub source parity

GitHub ledger/history is current through R3.4.21c, but the exact 36-file POST source snapshot is **not yet archived under `apps-script/`**.

The verified POST ZIP was created locally as:

`TaskMapping-R3.4.21c_REQUESTED_BY_ORGANIZER_EMPLOYEE_COUNT_FIX-POST-20260911-154430.zip`

Upload that ZIP to this Task Mapping conversation. Then ChatGPT can:

1. inspect the exact verified source;
2. compare the 36-file inventory;
3. screen for secrets/customer PII before committing to the public repository;
4. archive the safe canonical source using the connected GitHub integration;
5. read GitHub back and mark production-source parity PASS.

## Other open items

- overlapping report-refresh cadence reduction is reviewed but not deployed;
- PreInspect scheduler safety remains under review;
- Field 854 and new-location paths still require final controlled proofs;
- DONE → Install Calendar and DONE → Sales Order handoffs remain downstream work.

## Next exact action

**Run one real PreInspection reconciliation to verify organizer → Employee Requested By.**

Then upload the verified POST ZIP for the GitHub source archive.
