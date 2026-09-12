# Task Mapping — TEST Environment Plan

## Purpose

Create an isolated environment for validating Task Mapping changes before any code is pushed to the production Apps Script project.

This plan covers the entire Task Mapping system:

- Install
- Delivery
- Service
- PreInspection
- shared scheduler/report/cache/resolution/planning/execution/link/verification modules

## Hard release rule

No reorganized or modified Task Mapping code is pushed to the production Apps Script project until the affected functionality passes the available pre-push TEST gates.

A production push is followed by source read-back and runtime verification. Passing pre-push tests does not replace post-push verification.

## Environment separation

### Production

- existing production Apps Script project
- production spreadsheet
- production Install, Delivery, Service, and PreInspection calendars
- production Striven data
- existing production triggers

Production remains unchanged while TEST is being prepared and while cleanup/refactor work is under validation.

### TEST

TEST should use:

- a separate Apps Script project;
- a separate spreadsheet copied from the Task Mapping workbook structure;
- dedicated TEST Install Calendar;
- dedicated TEST Delivery Calendar;
- dedicated TEST Service Calendar;
- dedicated TEST PreInspection Calendar;
- separate environment configuration / Script Properties;
- no time-driven triggers initially;
- clear TEST logging/evidence.

## Striven write isolation

Preferred option: use an isolated Striven sandbox/test tenant if one exists.

If no Striven sandbox exists, TEST Striven mutation must be fail-closed and allowlist-only:

- only explicitly approved test Customer IDs may be mutated;
- only explicitly approved test Sales Order IDs may be used for write-capable tests;
- only explicitly approved test Task IDs may be patched;
- CREATE/RECREATE tests require an explicit TEST write-enable gate plus approved test context;
- all non-allowlisted records are read-only;
- uncertain CREATE is never retried blindly.

TEST must never silently fall back to unrestricted production Striven writes.

## Calendar write isolation

TEST code must write only to the four dedicated TEST calendars. Production Calendar IDs must not be accepted by a TEST environment.

Managed-link tests must preserve authored text, remain idempotent, aggregate all expected links for an event, and verify Calendar read-back.

## Sheet isolation

TEST must use the TEST spreadsheet only. Production spreadsheet IDs must be rejected when `ENVIRONMENT=TEST`.

## Environment contract

One environment resolver should supply all environment-sensitive IDs and write policy. Business logic should not scatter `if (TEST)` checks throughout unrelated workflow functions.

Required environment fields are documented under `config/environments/`.

## Initial trigger policy

Time-driven triggers stay disabled until manual TEST runs prove:

1. correct target project;
2. correct spreadsheet;
3. correct TEST calendars;
4. correct Striven write restrictions;
5. duplicate prevention;
6. read-back verification;
7. no unexpected production references.

Only after those checks pass should controlled TEST triggers be installed.

## Pre-push promotion gate

A candidate release may be considered for production only when applicable checks pass:

1. exact changed-file scope known;
2. syntax checks PASS;
3. function/dependency checks PASS;
4. environment isolation checks PASS;
5. Install regression PASS when affected;
6. Delivery regression PASS when affected;
7. Service regression PASS when affected;
8. PreInspection regression PASS when affected;
9. shared-module regression PASS for every caller workflow;
10. duplicate/recovery cases PASS where affected;
11. Calendar managed-link cases PASS where affected;
12. expected REVIEW/BLOCKED/DEFERRED behavior PASS;
13. material TEST writes read back correctly;
14. no production IDs/writes observed from TEST;
15. changed-file inventory matches the intended change.

If a check cannot be executed before production because it depends on production-only state, record it explicitly as `POST_PUSH_RUNTIME_PROOF_REQUIRED`. It does not become an assumed PASS.

## Production promotion sequence

`fresh production source pull -> compare TEST candidate to production -> final changed-file allowlist -> pre-push gate PASS -> production push -> immediate production source read-back -> targeted production smoke/runtime verification -> rollback on failure -> GitHub verified-source sync/read-back`

## Current status

Repository-side TEST framework: IN PROGRESS.

Separate Google Apps Script TEST project, TEST spreadsheet, TEST calendars, and Striven isolation: NOT YET CREATED/VERIFIED.

Exact current 36-file production source archive: PENDING.
