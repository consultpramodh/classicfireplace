# Task Mapping Fix Pack R4 / R4.1 / R4.2 / R4.3 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Service lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_1_20260915`  
**PreInspection lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_2_20260915`  
**PreInspection datetime transport hotfix:** `TASK_MAPPING_FIX_PACK_R4_3_20260915`  
**Branch:** `task_mapping`  
**Apps Script:** existing bound production project  

## Deployment result

- R4 source deployment: `DEPLOYED_SOURCE_VERIFIED`.
- R4 PRE clone: 58 files; POST clone: 59 files; added `97_Task_Mapping_Fix_Pack_R4.js`.
- Production TM2 cutover flags remained OFF.
- R4.1 corrected Service Calendar lookup to include the live `SERVICE_CONFIG.TECH_CALENDARS` configuration and preserved compatibility fallbacks.
- R4.1 source deployment: `DEPLOYED_SOURCE_VERIFIED`; PRE / POST 59 / 59.
- R4.2 corrected PreInspection authoritative Calendar lookup using `preinspectR3419FindEvent_()`, `preinspectR3420AssertProductionEvent_()`, and the configured production PreInspection Calendar IDs.
- R4.2 source deployment run `35012264500`, job `104526883130`: `DEPLOYED_SOURCE_VERIFIED`; PRE / POST 59 / 59; only `97_Task_Mapping_Fix_Pack_R4.js` changed.
- R4.2 artifact `10413983013`, SHA256 `42c31f2e9aea4b7190394ab145f897c3016526b5617d770f60446669f90919a5`.
- R4.3 corrects the remaining PreInspection afternoon time transport defect. The R3 path previously sent a 12-hour string such as `2026-09-16 01:00:00 PM`; Striven read back `2026-09-16T05:00:00.000Z`, i.e. 1:00 AM Eastern, showing that the endpoint ignored the PM suffix.
- R4.3 changes the PreInspection selected-row transport to the established local 24-hour ISO wall-clock shape, e.g. `2026-09-16T13:00:00`, using `preinspectR3418bMappingLocalIso_()` when available. Read-before-write and authoritative read-back verification remain in place.
- R4.3 source deployment run `35013105296`, job `104529701080`: `DEPLOYED_SOURCE_VERIFIED`.
- R4.3 PRE / POST file count: 59 / 59.
- R4.3 intentionally changed only `96_Selected_Row_End_To_End_R3.js` and `97_Task_Mapping_Fix_Pack_R4.js`; every other live file was hash-preserved.
- R4.3 artifact `10413454553`, artifact SHA256 `04d2a328f5b24745aec1007cf75c44e51e5faf4a444ef098938e1b4c5eb84c32`.

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
- The prior Service missing-calendar exception did not recur.
- Control Tower data build did not throw; visual UI acceptance remains separate.

## Controlled PreInspection write attempts

### R4.1 failure — Calendar lookup

Selected mapping row: PreInspect Task Mapping row 11, Task `18476`, Event ID `5ib34vdtqbe0l8bjmnj5fqd1tp@google.com`.

The mapping row is a current production PreInspection appointment with Calendar `2026-09-16 12:00–13:00`, Task Start `12:00`, Task Due `01:00`.

R4.1 failed safely before Striven mutation because the authoritative PreInspection Calendar event lookup used the wrong helper/config. R4.2 corrected that lookup.

### R4.2 runtime attempt — datetime transport failure

R4.2 successfully passed the Calendar preflight and progressed through the existing OPEN PreInspection workflow. Runtime evidence showed:

- Mapping remained `MATCHED`, `WOULD_PATCH_DATE_TIME`, Task `18476`.
- Customer: `NOT_NEEDED`, already correct.
- Location: `NOT_NEEDED`, already correct.
- Requested By: `NOT_NEEDED`, exact organizer routing to Employee `20`, Spencer Bambek, by `CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE`.
- Striven DueDateTime PATCH payload was `2026-09-16 01:00:00 PM`.
- Authoritative read-back was `2026-09-16T05:00:00.000Z`, equivalent to 1:00 AM Eastern, not the desired 1:00 PM.
- The workflow failed closed immediately at read-back verification and did not continue to later steps.

This evidence isolates the defect to the 12-hour AM/PM transport representation. R4.3 replaces that transport with local 24-hour ISO (`yyyy-MM-dd'T'HH:mm:ss`) while keeping the same read-before-write and read-back verification.

## Updated fix tracker

| ID | Fix | Source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection AM/PM date-time reconciliation | **R4.3 DEPLOYED** | **CONTROLLED WRITE RETEST REQUIRED** — transport changed from 12-hour AM/PM to local 24-hour ISO; read-back must prove Task 18476 Due becomes 13:00 |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-03 | Prevent blind retry after uncertain writes | DEPLOYED | **Runtime evidence supports fail-closed behavior; additional uncertain-write case coverage still required** |
| FIX-04 | Material selected-row write read-back | DEPLOYED | **PASS behavior observed** — R4.2 correctly detected the bad Due read-back and stopped; successful-write verification still required |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | **READ-ONLY PIPELINE PASS AT SUITE LEVEL** |
| FIX-07 | Calendar freshness before selected-row consequential work | R4.2 DEPLOYED | **PreInspection authoritative lookup now passes far enough to reach Striven patch path** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | **TARGETED RECOVERY REGRESSION REQUIRED** |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PASS AGAIN in R4.2 runtime attempt** — Employee 20 Spencer Bambek from organizer email |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** in R4.1 read-only regression |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-13 | One consolidated regression suite | R4.2 DEPLOYED | **R4.1 PASS**; R4.2 added PreInspection Calendar lookup coverage |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |

## Current next verification

Refresh/reopen the spreadsheet and rerun the same PreInspect Task Mapping row 11 / Task `18476` using `🚀 Run Selected Row End-to-End`. R4.3 will re-read current Striven state before attempting any change. Acceptance requires the DueDateTime transport to be `2026-09-16T13:00:00`, authoritative Striven Due read-back to equal 1:00 PM Eastern, final Start/Due to match Calendar 12:00–13:00, and the correct Calendar task link. No wider production cutover is authorized by this test.
