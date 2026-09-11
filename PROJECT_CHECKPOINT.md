# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-09-11

## Production Version

`PreInspect R3.4.20a` remains the latest source release explicitly evidenced as remotely read back from Apps Script. The approved next business change is still `R3.4.21_REQUESTED_BY_ORGANIZER_EMPLOYEE`; it is **not yet deployed**.

## Active Objective

Deploy and runtime-verify the PreInspection-only Requested By change:

`Calendar organizer email → exact Striven Employee → RequestedBy.Type = employee`

Install, Delivery, and Service must remain unchanged.

## Deployment attempts

### R3.4.21a — BLOCKED BEFORE WRITE

The local package self-test passed, but the PRE source pull printed `Project file already exists.` and the unified Task Mapping fingerprint failed. The guard stopped the package before any Apps Script push, so production source was not modified.

Root cause: clasp v3 can discover an existing parent `.clasp.json`, while clone/rootDir configuration-file behavior changed in v3. Temporary deployment folders therefore were not isolated strongly enough.

The failed attempt is recorded in `executions/2026-09-11-r3.4.21a-blocked.json`.

### R3.4.21b — PREPARED

The corrected package no longer uses `clasp clone`.

Each PRE / WORK / FRESH / POST / ROLLBACK workspace gets its own explicit `.clasp.json` containing the known Task Mapping Script ID and `rootDir: src`. Every pull or push uses `--project <exact workspace .clasp.json>`, preventing clasp from inheriting another project file elsewhere on the PC.

The package still preserves the existing safeguards:

- package self-test before production access;
- known Task Mapping Script ID;
- 30+ file unified-project fingerprint;
- exactly two allowlisted changed files (`35_PreInspect_Task_Review.js`, `36_PreInspect_Task_Create.js`);
- syntax checks;
- fresh-source comparison immediately before push;
- full POST SHA verification;
- automatic PRE rollback plus rollback read-back if verification fails;
- no local GitHub authentication/push.

## Current business rule

PreInspection Requested By resolves from the Google Calendar organizer email to exactly one Striven Employee and writes `RequestedBy.Type = employee`. There is no customer-contact fallback. Unresolved or ambiguous organizer identity must REVIEW / NO WRITE.

## Next exact action

Run the R3.4.21b ZIP package and double-click `RUN_AUTO_UPDATE.cmd`.

Success must end with `DEPLOYED_SOURCE_VERIFIED` and produce a verified POST ZIP. Upload that POST ZIP to this Task Mapping conversation so ChatGPT can archive the exact verified source and execution record through the connected GitHub integration.

## Required runtime verification

After source deployment succeeds, use one real PreInspection whose organizer resolves unambiguously to a Striven Employee and verify:

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
