# Task Mapping Fix Pack R4 / R4.1 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Service lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_1_20260915`  
**Branch:** `task_mapping`  
**Apps Script:** existing bound production project  

## Deployment result

- R4 source deployment: `DEPLOYED_SOURCE_VERIFIED`
- R4 PRE clone: 58 files
- R4 POST clone: 59 files
- Added: `97_Task_Mapping_Fix_Pack_R4.js`
- Production TM2 cutover flags remained OFF.
- R4.1 corrected Service Calendar lookup to include the live `SERVICE_CONFIG.TECH_CALENDARS` configuration and preserved compatibility fallbacks.
- R4.1 source deployment: `DEPLOYED_SOURCE_VERIFIED`.
- R4.1 PRE / POST file count: 59 / 59; only `97_Task_Mapping_Fix_Pack_R4.js` changed.

## R4.1 read-only regression — 2026-09-15

Function: `runTaskMappingFixPackR4Regression()`  
Execution: **Completed** in 43.229 seconds.  
Mode: `READ_ONLY_REGRESSION`.  
Business workflow writes: **0**.

Verified from runtime evidence:

- Report parser: **PASS** — valid empty result recognized, valid rows recognized, malformed/unrecognized result blocked.
- TM2 connectivity audit: **PASS**.
- TM2 diagnostics: **PASS**.
- TM2 Install shadow: **PASS**, 45 rows; endpoint counts `DEFERRED_RETRY=4`, `SHADOW_ONLY=40`, `REVIEW_REQUIRED=1`.
- TM2 Delivery shadow: **PASS**, 14 rows; endpoint counts `DEFERRED_RETRY=2`, `SHADOW_ONLY=11`, `REVIEW_REQUIRED=1`.
- TM2 Service shadow: **PASS**, 81 rows; endpoint counts `DEFERRED_RETRY=5`, `SHADOW_ONLY=75`, `REVIEW_REQUIRED=1`.
- TM2 PreInspection shadow: **PASS**, 74 rows; endpoint counts `SHADOW_ONLY=56`, `REVIEW_REQUIRED=18`.
- TM2 all-workflow shadow run: **PASS**.
- TM2 test suite: **PASS**.
- All cutover flags remained false and TM2 business write attempts remained 0.
- The prior `Service Calendar event not found for aggregated link write` exception did **not** recur; the R4.1 regression completed successfully. Event-level Service dry-run detail was truncated from Apps Script logging, so individual Service event outcomes are not claimed as fully verified yet.
- Control Tower data build did not throw during the completed regression; visual UI acceptance still requires manual inspection.

## Updated fix tracker

| ID | Fix | Source status | Runtime status after R4.1 regression |
|---|---|---|---|
| FIX-01 | PreInspection AM/PM date-time reconciliation | DEPLOYED | **CONTROLLED WRITE TEST STILL REQUIRED** — read-only regression cannot prove the corrected Striven PATCH/read-back path |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-03 | Prevent blind retry after uncertain writes | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-04 | Material selected-row write read-back | DEPLOYED | **RUNTIME WRITE TEST REQUIRED** |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | **READ-ONLY PIPELINE PASS AT SUITE LEVEL** — previous missing-calendar exception fixed; individual event outcomes still need compact evidence / controlled runtime verification |
| FIX-07 | Calendar freshness before selected-row consequential work | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | **TARGETED RECOVERY REGRESSION REQUIRED** |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PRIOR RUNTIME EVIDENCE PASS**; R4.1 regression did not alter this path |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** in R4.1 read-only regression |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-13 | One consolidated regression suite | DEPLOYED | **PASS** — completed successfully |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |

## Current next verification

The read-only regression gate has passed. The next controlled verification is one known-safe **PreInspection OPEN task with the AM/PM mismatch** using the existing `🚀 Run Selected Row End-to-End` menu command. Acceptance requires exact Striven Start/Due read-back and the correct Calendar task link. No wider production cutover is authorized by this regression result.
