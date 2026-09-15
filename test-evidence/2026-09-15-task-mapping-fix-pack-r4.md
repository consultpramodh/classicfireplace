# Task Mapping Fix Pack R4–R4.5 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Current release:** `TASK_MAPPING_FIX_PACK_R4_5_20260915`  
**Branch:** `task_mapping`  
**Apps Script:** existing bound production project  
**TM2 production cutover:** OFF

## Deployment history

- **R4:** consolidated selected-row safety/readback/report/control-tower fix pack. PRE 58 files → POST 59 files; added `97_Task_Mapping_Fix_Pack_R4.js`; source deployment verified.
- **R4.1:** corrected Service Calendar lookup to include live `SERVICE_CONFIG.TECH_CALENDARS`; source deployment verified. R4.1 read-only regression completed successfully with 0 business workflow writes.
- **R4.2:** corrected authoritative PreInspection Calendar lookup using the established production PreInspection event lookup/configuration; source deployment verified.
- **R4.3:** replaced the failed 12-hour AM/PM PreInspection datetime transport with local 24-hour ISO wall-clock transport; source deployment verified.
- **R4.4:** added bounded retry for the exact safe ScriptLock error `Could not obtain script lock. No Striven write attempted.` and ScriptLock protection around direct PI datetime reconciliation; source deployment verified.
- **R4.5:** quarantines known-bad PreInspection Task Type 105 afternoon schedule PATCH attempts before mutation and adds a read-only selected-row diagnostic comparing v2/v1 task date models. It does **not** invent or guess a new write endpoint.

## R4.5 deployment

The first R4.5 builder run `35017386517` failed during local syntax validation **before the Apps Script push step**. No live source was changed by that failed attempt.

The corrected guarded R4.5 deployment then ran successfully:

- GitHub Actions run: `35017877094`
- Job: `104545809420`
- Result: `DEPLOYED_SOURCE_VERIFIED`
- PRE file count: 59
- POST file count: 59
- Intentionally modified live files only:
  - `02_Menu.js`
  - `35_PreInspect_Task_Review.js`
  - `96_Selected_Row_End_To_End_R3.js`
  - `97_Task_Mapping_Fix_Pack_R4.js`
- Every other live file was hash-preserved by the guarded deploy.
- Artifact: `task-mapping-fix-pack-r4-5-35017877094`
- Artifact ID: `10415524549`
- Artifact SHA256: `93e4e304df33709b37e13bc63ca37271f14961173369ebee7e44c1e70ddefa67`
- No triggers were added.
- TM2 cutover was not changed.

## R4.1 read-only regression

Function: `runTaskMappingFixPackR4Regression()`  
Mode: `READ_ONLY_REGRESSION`  
Business workflow writes: **0**

Verified:

- Report parser PASS: legitimate zero-row result accepted; malformed/unrecognized report result rejected.
- TM2 connectivity audit PASS.
- TM2 diagnostics PASS.
- Install, Delivery, Service and PreInspection shadow runs PASS at suite level.
- All TM2 cutover flags remained false.
- The earlier Service Calendar lookup exception did not recur.

## Controlled PreInspection Task 18476 evidence

Selected mapping row: **PreInspect Task Mapping row 11**  
Event ID: `5ib34vdtqbe0l8bjmnj5fqd1tp@google.com`  
Task ID: `18476`  
Desired Calendar schedule: **2026-09-16 12:00 PM → 1:00 PM**

### Confirmed healthy context

Across the controlled attempts:

- Mapping consistently resolved `MATCHED` / `WOULD_PATCH_DATE_TIME` to Task `18476`.
- Customer `62488`: `NOT_NEEDED`, already correct.
- Location `58134`: `NOT_NEEDED`, already correct.
- Requested By: `NOT_NEEDED`, exact Calendar organizer routing to Employee `20`, Spencer Bambek, via `CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE`.
- Authoritative Calendar lookup now succeeds.
- Material write read-back correctly fails closed when Striven stores the wrong value.

### PM datetime defect — confirmed across transports

Task 18476 and earlier PreInspection evidence show the same material defect: afternoon schedule PATCH values are stored/read back **12 hours early** for this PreInspection task path.

Observed failed transports include:

1. timezone-explicit offset ISO on earlier PI tests,
2. local 12-hour string with `AM/PM`, and
3. local 24-hour ISO wall-clock.

Latest R4.4 runtime attempt sent:

`DueDateTime = 2026-09-16T13:00:00`

but authoritative Striven read-back returned:

`2026-09-16T05:00:00.000Z`

which is **1:00 AM Eastern**, not the intended **1:00 PM Eastern**.

The run failed closed immediately and did not proceed to later assignment/notes/Calendar-link steps.

Historical evidence also shows:

- Service tasks successfully accept afternoon PATCH values, so this is not treated as a global generic Striven datetime formatting defect.
- PreInspection morning task writes/creates have verified correctly in prior runtime evidence.
- Earlier PreInspection Task `18383` showed the same exact 12-hour PM collapse using explicit offset timestamps.

Therefore R4.5 stops further trial-and-error PM writes until an alternate supported Striven write contract is identified.

## R4.5 safety behavior

R4.5 adds `tmR45AssertPreInspectDateTimePatchSafe_()` to the known PreInspection datetime mutation paths. If an intended PreInspection `StartDateTime` or `DueDateTime` is 13:00 or later, the mutation is blocked **before** the PATCH and returns the explicit condition:

`BLOCKED_STRIVEN_PI_PM_PATCH_DEFECT`

This quarantine is applied to:

- the selected-row sequential PreInspection datetime reconciliation,
- the legacy PreInspection manual PATCH helper, and
- the exact R3.4.18b PreInspection datetime PATCH path.

R4.5 also adds the read-only function:

`inspectSelectedPreInspectDateTimeTransportR45()`

Menu location:

**Pre Inspect → Diagnostics / Preview → 🕒 Diagnose Selected PI Date/Time**

The diagnostic:

- performs no Striven mutation,
- performs no Calendar mutation,
- reads the selected row and authoritative Calendar event,
- reads the selected task's v2 date model,
- attempts the legacy v1 task date model read if supported,
- compares against known-correct PM reference Task `18309`, and
- logs the evidence needed before selecting any alternate write route.

## Updated fix tracker

| ID | Fix | Source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection AM/PM date-time reconciliation | **R4.5 SAFETY FIX DEPLOYED** | **WRITE ROUTE UNRESOLVED / DIAGNOSTIC REQUIRED** — known-bad PM PATCH is now quarantined; no more format guessing |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | Runtime case test required |
| FIX-03 | Prevent blind retry after uncertain writes | DEPLOYED | **PASS safety behavior observed**; R4.4 retry limited to explicit no-write lock failures |
| FIX-04 | Material selected-row write read-back | DEPLOYED | **PASS fail-closed behavior observed**; successful PM PI write remains blocked by FIX-01 |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | Runtime case test required |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | Read-only pipeline PASS at suite level |
| FIX-07 | Calendar freshness before consequential selected-row work | R4.2 DEPLOYED | **PASS on controlled PI attempts** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | Targeted recovery regression required |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PASS repeatedly** — Task 18476 resolves Employee 20 Spencer Bambek |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** in consolidated read-only regression |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | Data-build PASS; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | Data-build PASS; visual review pending |
| FIX-13 | Consolidated regression suite | DEPLOYED | R4.1 suite PASS; later Calendar source coverage added |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | Runtime case test required |

## Current next verification

Do **not** run the selected-row E2E PM write again for Task `18476` yet.

Refresh/reopen the spreadsheet, keep PreInspect Task Mapping row 11 / Task `18476` selected, then run:

**Pre Inspect → Diagnostics / Preview → 🕒 Diagnose Selected PI Date/Time**

This next step is read-only. The resulting v2/v1 evidence will determine whether a supported alternate Striven update contract exists without risking another incorrect PM mutation.
