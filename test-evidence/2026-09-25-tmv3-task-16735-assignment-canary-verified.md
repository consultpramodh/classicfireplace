# TM V3 — Task 16735 Assignment Canary Verified

**Date:** 2026-09-25  
**Status:** VERIFIED  
**Engine:** `3.11.14-legacy-assignment-parity-r1`  
**Scope:** one existing Install Task assignment only

## Before

Fresh Step 7 verified:

- Task: `16735`
- desired assignment: `employee:15`
- actual assignment: `employee:41`
- assignment check: `MISMATCH`
- plan: `PATCH_ASSIGNMENTS`
- customer/order/location/requested-by/date checks: matched
- blocker: none

No date, relationship, create/recreate, or Calendar-link mutation was included in the assignment-only canary.

## Canary

- GitHub Actions run: `36198082523`
- artifact: `10889969862`
- result: success
- source-head hash parity: verified
- runner transport: quota-safe existing HEAD web-app
- Apps Script bound source restored after execution

The canary used the existing V3 assignment reconciliation. For Install this adds the intended legacy-rule assignee and preserves unrelated/manual employees.

## Fresh post-write verification

- GitHub Actions run: `36198236398`
- artifact: `10891320276`

Fresh authoritative result:

- desired assignment: `employee:15`
- actual assignment: `employee:15,employee:41`
- assignment check: `MATCH`
- fresh Step 7 plan: `NO_CHANGE`
- blocker: none
- engine: `3.11.14-legacy-assignment-parity-r1`
- source-head hash parity: verified

The release manifest was returned to `SHADOW_READ_ONLY` with writes disabled after the canary.
