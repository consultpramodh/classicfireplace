# TM V3 — Title-Only Assignee Resolution Verification

**Date:** 2026-09-25 (America/Toronto)  
**Status:** VERIFIED  
**V3 engine:** `3.11.9-assignee-title-only-r1`  
**GitHub Actions run:** `36183055729`  
**Artifact:** `10885545480`  
**Artifact SHA-256:** `05bdbcbd734e83985cb6124d67efbf2f5749dbb83349bac0df9bb924b6d9fa4a`

## Scope

Live read-only Step-7 verification for Install Task `18678` after restoring the legacy/canonical assignee rule:

> Install and Delivery assignee names must be explicit in the Google Calendar event title. Narrative description text is not assignment evidence.

No Striven or Google Calendar business mutation was authorized or executed.

## Root cause fixed

V3 previously searched both Calendar title and description for assignee-name patterns. A narrative note containing an incidental reference to `SF` therefore produced a false desired assignment to employee `15`.

V3 now:

- parses Install / Delivery assignment names from **Calendar title only**;
- ignores narrative description references for assignment;
- uses normalized whole-token / whole-phrase matching;
- continues to ignore Aiden as an assignment target;
- preserves Service calendar-derived assignment and PreInspection-specific assignment rules.

## Live verification

Fresh Step 7 for Task `18678` returned:

- Customer: `MATCH`
- Order: `MATCH`
- Location: `MATCH`
- Requested By: `MATCH`
- Calendar start vs canonical Task start: `MATCH`
- Calendar end vs canonical Task due: `MATCH`
- Schedule source: `V1_DESIRED_START_END`
- Desired assignment: none
- Existing assignment: preserved
- Assignment check: `N/A`
- Final reconciliation plan: `NO_CHANGE`
- Blocker: none
- Read status: `FRESH_TASK_GET`
- Write gate: `SHADOW_ONLY__NO_WRITES`
- Source-head hash parity after execution: verified

## Runtime-verifier improvement

The read-only verification runner now reuses the project's Apps Script HEAD/test web-app deployment through the authenticated `/dev` endpoint instead of allocating a new versioned deployment for every read-only probe.

This eliminated the prior temporary-deployment `RESOURCE_EXHAUSTED` path while preserving source restoration and hash-parity verification.

## Conclusion

The Task `18678` assignment mismatch was a V3 inference false positive, not a Striven assignment defect.

The false-positive assignment plan is resolved and the case now converges to `NO_CHANGE` without modifying Striven.
