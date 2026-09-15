# Task Mapping Fix Pack R4 / R4.1 / R4.2 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Service lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_1_20260915`  
**PreInspection lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_2_20260915`  
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
- R4.2 corrected PreInspection authoritative Calendar lookup. R4/R4.1 referenced a nonexistent `preinspectR3418bFindFreshCalendarEvent_` helper and an inactive `PREINSPECT_R34.CALENDAR_ID` fallback. R4.2 now uses the proven `preinspectR3419FindEvent_()` lookup, applies `preinspectR3420AssertProductionEvent_()` to reject the test calendar for production work, and includes the configured production IDs from `PREINSPECT_R3418F_CALENDAR_ID`, `PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID`, and `PREINSPECT_CALENDAR_SYNC_CONFIG.CALENDAR_ID` as fallbacks.
- R4.2 source deployment run: `35012264500`; job: `104526883130`.
- R4.2 source deployment: `DEPLOYED_SOURCE_VERIFIED`.
- R4.2 PRE / POST file count: 59 / 59; only `97_Task_Mapping_Fix_Pack_R4.js` changed.
- R4.2 artifact: `10413983013`; artifact SHA256 `42c31f2e9aea4b7190394ab145f897c3016526b5617d770f60446669f90919a5`.
- R4.2 also extends the read-only regression with `tmR42_testPreInspectCalendarLookup_()` so a broken PreInspection Calendar source configuration is caught before another controlled write test.

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
- The prior `Service Calendar event not found for aggregated link write` exception did **not** recur; the R4.1 regression completed successfully.
- Control Tower data build did not throw during the completed regression; visual UI acceptance still requires manual inspection.

## Controlled PreInspection write attempt — failure that triggered R4.2

Selected mapping row: PreInspect Task Mapping row 11, Task `18476`, Event ID `5ib34vdtqbe0l8bjmnj5fqd1tp@google.com`.

The mapping row is a current production PreInspection appointment and still shows the target AM/PM defect: Calendar `2026-09-16 12:00–13:00`, Task Start `12:00`, Task Due `01:00`.

R4.1 selected-row execution failed safely before any Striven mutation with:

`BLOCKED: Authoritative Calendar event could not be found for Event ID 5ib34vdtqbe0l8bjmnj5fqd1tp@google.com.`

Root cause was the R4 PreInspection Calendar lookup configuration, not a missing appointment. The existing PreInspection production source is configured through `PREINSPECT_REVIEW_CONFIG.CALENDAR_SYNC.CALENDAR_ID` / `PREINSPECT_R3418F_CALENDAR_ID`, while R4/R4.1 attempted a nonexistent helper and inactive fallback.

## Updated fix tracker

| ID | Fix | Source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection AM/PM date-time reconciliation | R4.2 DEPLOYED | **CONTROLLED WRITE RETEST REQUIRED** — Calendar preflight lookup is now fixed; Striven PATCH/read-back still needs runtime proof |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-03 | Prevent blind retry after uncertain writes | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-04 | Material selected-row write read-back | DEPLOYED | **RUNTIME WRITE TEST REQUIRED** |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | **READ-ONLY PIPELINE PASS AT SUITE LEVEL** |
| FIX-07 | Calendar freshness before selected-row consequential work | R4.2 DEPLOYED | **PreInspection lookup source corrected; runtime selected-row proof still required** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | **TARGETED RECOVERY REGRESSION REQUIRED** |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PRIOR RUNTIME EVIDENCE PASS** |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** in R4.1 read-only regression |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-13 | One consolidated regression suite | R4.2 DEPLOYED | **R4.1 PASS; R4.2 adds PreInspection Calendar lookup coverage and should be rerun** |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |

## Current next verification

Refresh/reopen the spreadsheet and rerun the same PreInspect Task Mapping row 11 / Task `18476` using `🚀 Run Selected Row End-to-End`. The prior failure occurred before a business write, so this is a safe direct retest of the corrected Calendar preflight. Acceptance requires: authoritative production Calendar event found, exact Striven Start/Due read-back, and the correct Calendar task link. No wider production cutover is authorized by this test.
