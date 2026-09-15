# Task Mapping Fix Pack R4 / R4.1 / R4.2 / R4.3 / R4.4 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Service lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_1_20260915`  
**PreInspection lookup hotfix:** `TASK_MAPPING_FIX_PACK_R4_2_20260915`  
**PreInspection datetime transport hotfix:** `TASK_MAPPING_FIX_PACK_R4_3_20260915`  
**PreInspection lock-contention hotfix:** `TASK_MAPPING_FIX_PACK_R4_4_20260915`  
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
- R4.3 corrected the PreInspection afternoon time transport. The previous 12-hour payload `2026-09-16 01:00:00 PM` was interpreted by Striven as 1:00 AM Eastern. R4.3 replaced it with local 24-hour ISO wall-clock transport such as `2026-09-16T13:00:00` while retaining read-before-write and authoritative read-back verification.
- R4.3 source deployment run `35013105296`, job `104529701080`: `DEPLOYED_SOURCE_VERIFIED`; PRE / POST 59 / 59.
- R4.3 intentionally changed only `96_Selected_Row_End_To_End_R3.js` and `97_Task_Mapping_Fix_Pack_R4.js`; every other live file was hash-preserved.
- R4.3 artifact `10413454553`, SHA256 `04d2a328f5b24745aec1007cf75c44e51e5faf4a444ef098938e1b4c5eb84c32`.
- R4.4 addresses transient Apps Script `ScriptLock` contention during the selected-row PreInspection sequence. Manual single-field helpers still keep their existing script locks, but the E2E path now retries only the exact safe error `Could not obtain script lock. No Striven write attempted.` with bounded backoff and re-verifies the selected Event ID / Task ID before each retry.
- R4.4 also acquires a ScriptLock before the direct PreInspection datetime mutation so scheduled/background executions cannot interleave with the Start/Due PATCH sequence.
- R4.4 does **not** retry arbitrary write failures; retry is permitted only when the failing helper explicitly confirms no Striven write occurred.
- R4.4 source deployment run `35014769858`, job `104535309853`: `DEPLOYED_SOURCE_VERIFIED`.
- R4.4 PRE / POST file count: 59 / 59.
- R4.4 intentionally changed only `96_Selected_Row_End_To_End_R3.js` and `97_Task_Mapping_Fix_Pack_R4.js`; every other live file was hash-preserved.
- R4.4 artifact `10415695189`, SHA256 `0b917cf950837086fed2ea3d8b7d37c36db0e02efa00d63949ae6dd70fc75103`.

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

This isolated the defect to the 12-hour AM/PM transport representation. R4.3 replaced that transport with local 24-hour ISO (`yyyy-MM-dd'T'HH:mm:ss`).

### R4.3 runtime attempt — transient ScriptLock contention

The R4.3 retry reached the current production row and again confirmed:

- Mapping `MATCHED`, `WOULD_PATCH_DATE_TIME`, Task `18476`.
- Customer: `NOT_NEEDED`, already correct.
- Location: `NOT_NEEDED`, already correct.

Before Requested By or the datetime step ran, `preinspectR30RunManualPush_()` could not obtain the project ScriptLock within its existing 10-second window and returned the explicit safe error:

`Could not obtain script lock. No Striven write attempted.`

This is consistent with another scheduled/background Apps Script execution briefly owning the same project ScriptLock. The run failed before the R4.3 datetime transport could be tested, so no claim is made that R4.3 runtime datetime verification passed.

R4.4 adds bounded safe retry for this exact no-write lock error and protects the direct datetime mutation with a ScriptLock as well.

## Updated fix tracker

| ID | Fix | Source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection AM/PM date-time reconciliation | **R4.4 DEPLOYED** | **CONTROLLED WRITE RETEST REQUIRED** — R4.3 24-hour ISO transport remains active; R4.4 removes transient lock contention as the next blocker |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-03 | Prevent blind retry after uncertain writes | **R4.4 DEPLOYED** | **SAFE-RETRY RULE STRENGTHENED** — lock retry occurs only when helper states no Striven write occurred; uncertain-write failures still fail closed |
| FIX-04 | Material selected-row write read-back | DEPLOYED | **PASS safety behavior observed** — bad Due read-back was detected and stopped; successful-write verification still required |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | **READ-ONLY PIPELINE PASS AT SUITE LEVEL** |
| FIX-07 | Calendar freshness before selected-row consequential work | R4.2 DEPLOYED | **PreInspection authoritative lookup passed in subsequent runtime attempts** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | **TARGETED RECOVERY REGRESSION REQUIRED** |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PASS in R4.2 runtime attempt** — Employee 20 Spencer Bambek from organizer email; R4.3 attempt was lock-blocked before this step |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** in R4.1 read-only regression |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | **DATA-BUILD PASS**; visual review pending |
| FIX-13 | One consolidated regression suite | R4.2 DEPLOYED | **R4.1 PASS**; R4.2 added PreInspection Calendar lookup coverage |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | **RUNTIME CASE TEST REQUIRED** |

## Current next verification

Refresh/reopen the spreadsheet and rerun the same PreInspect Task Mapping row 11 / Task `18476` using `🚀 Run Selected Row End-to-End`. R4.4 will safely wait/retry if a background execution briefly owns the ScriptLock, while still re-verifying Event ID / Task ID before each retry. Acceptance requires the DueDateTime transport to be `2026-09-16T13:00:00`, authoritative Striven Due read-back to equal 1:00 PM Eastern, final Start/Due to match Calendar 12:00–13:00, and the correct Calendar task link. No wider production cutover is authorized by this test.
