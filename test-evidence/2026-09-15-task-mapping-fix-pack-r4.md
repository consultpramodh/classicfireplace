# Task Mapping Fix Pack R4–R4.6 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Current release:** `TASK_MAPPING_FIX_PACK_R4_6_20260915`  
**Branch:** `task_mapping`  
**Apps Script:** existing bound production project  
**TM2 production cutover:** OFF

## Deployment history

- **R4:** consolidated selected-row safety/readback/report/control-tower fix pack. PRE 58 files → POST 59 files; source deployment verified.
- **R4.1:** corrected Service Calendar lookup to include live `SERVICE_CONFIG.TECH_CALENDARS`; read-only consolidated regression passed with 0 business workflow writes.
- **R4.2:** corrected authoritative PreInspection Calendar lookup.
- **R4.3:** tested local 24-hour ISO transport after the prior 12-hour string failed.
- **R4.4:** added bounded retry for the exact safe ScriptLock error `Could not obtain script lock. No Striven write attempted.` and lock protection around PI datetime reconciliation.
- **R4.5:** quarantined known-bad Task Type 105 afternoon v2 datetime PATCH attempts and added a read-only v1/v2 diagnostic.
- **R4.6:** uses the v1 task model `DesiredStartDate` / `DesiredEndDate` as the canonical PreInspection schedule when v2 disagrees with Calendar. It does not guess a new v1 write endpoint. The R4.5 v2 PM PATCH quarantine remains as a fail-safe.

## R4.5 diagnostic — root cause identified

Selected mapping row: **PreInspect Task Mapping row 11**  
Event ID: `5ib34vdtqbe0l8bjmnj5fqd1tp@google.com`  
Task ID: `18476`  
Fresh Calendar: **2026-09-16 12:00 PM → 1:00 PM**

The read-only R4.5 diagnostic completed with no Striven or Calendar writes and proved that the two Striven task models disagree for PreInspection PM times:

### Task 18476

- v2 `StartDateTime`: `2026-09-16T12:00:00-04:00`
- v2 `DueDateTime`: `2026-09-16T01:00:00-04:00`
- v1 `DesiredStartDate`: `2026-09-16T12:00:00`
- v1 `DesiredEndDate`: `2026-09-16T13:00:00`
- Calendar: `12:00 → 13:00`

Therefore **v1 matches Calendar exactly while v2 represents the 1:00 PM due time as 1:00 AM**.

The same pattern appears on reference Task `18309`:

- v2 Due: `01:00`
- v1 Desired End: `13:00`

This changes the diagnosis: the available evidence does **not** support treating the underlying PreInspection schedule as incorrectly stored merely because v2 shows the PM hour 12 hours early. For Task Type 105 PM schedule verification/matching, v1 `DesiredStartDate` / `DesiredEndDate` is the canonical read model when v2 conflicts with Calendar.

## R4.6 behavior

R4.6 changes the PreInspection schedule path as follows:

1. Normal candidate matching still reads v2 first.
2. Only when v2 Start/Due disagrees with the Calendar for Task Type 105 does the workflow perform an additional read-only v1 GET.
3. If v1 `DesiredStartDate` / `DesiredEndDate` match Calendar, those values become the canonical Task Start/Due used for matching and mapping.
4. Mapping evidence includes `V1_DATES` when the canonical v1 schedule resolved the discrepancy.
5. Selected-row E2E reads v1 before any schedule PATCH. If v1 already matches Calendar, it records `DATE_TIME_CANONICAL_V1_VERIFIED` / `NOT_NEEDED_CANONICAL_V1_MATCH` and performs **no schedule PATCH**.
6. If canonical v1 does not match Calendar, the existing guarded reconciliation path remains available, but R4.5 still blocks known-bad PI PM v2 PATCHes before mutation.

This design avoids doubling API usage for normal rows because the additional v1 task GET is only made when the v2 schedule disagrees with Calendar.

## R4.6 deployment

The first R4.6 workflow run `35018804573` failed safely during its deployment preflight because the deploy script checked for the R4.5 guard using the wrong source marker. The failure occurred **before the push step**, so no live Apps Script source was changed.

The corrected guarded deployment then completed successfully:

- GitHub Actions run: `35019098002`
- Job: `104549942369`
- Result: `DEPLOYED_SOURCE_VERIFIED`
- PRE file count: 59
- POST file count: 59
- Intentionally modified live files only:
  - `35_PreInspect_Task_Review.js`
  - `96_Selected_Row_End_To_End_R3.js`
  - `97_Task_Mapping_Fix_Pack_R4.js`
- Every other live file was hash-preserved by the guarded deployment.
- Artifact: `task-mapping-fix-pack-r4-6-35019098002`
- Artifact ID: `10416243199`
- Artifact SHA256: `68c53efb0914c42c28e88c53812446ddca310f64819abd20e2239ceebe1902ee`
- No triggers were added.
- TM2 cutover remained OFF.

## Confirmed healthy context for Task 18476

Across controlled attempts:

- Customer `62488`: already correct.
- Location `58134`: already correct.
- Requested By: Employee `20`, Spencer Bambek, via `CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE`.
- Authoritative Calendar lookup passes.
- ScriptLock contention handling is bounded and safe.
- Bad/ambiguous material-write readback fails closed.
- No blind retry is allowed after an uncertain write.

## Updated fix tracker

| ID | Fix | Source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection date/time reconciliation | **R4.6 DEPLOYED** | **E2E RETEST REQUIRED** — root cause identified as v2 PM representation mismatch; v1 canonical schedule matches Calendar |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | Runtime case test required |
| FIX-03 | Prevent blind retry after uncertain writes | DEPLOYED | **PASS safety behavior observed** |
| FIX-04 | Material selected-row write/readback verification | DEPLOYED | **PASS fail-closed behavior observed**; R4.6 now avoids false v2 PM mismatch by canonical v1 verification |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | Runtime case test required |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | Read-only pipeline PASS; production multi-fireplace runtime case still pending |
| FIX-07 | Calendar freshness before consequential selected-row work | R4.2 DEPLOYED | **PASS on controlled PI attempts** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | Targeted recovery regression required |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PASS repeatedly** — Task 18476 resolves Employee 20 Spencer Bambek |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | Data-build PASS; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | Data-build PASS; visual review pending |
| FIX-13 | Consolidated regression suite | DEPLOYED | **Read-only suite PASS** |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | Runtime case test required |

## Current next verification

Refresh/reopen the spreadsheet, keep **PreInspect Task Mapping row 11 / Task 18476** selected, then run:

**🚀 Run Selected Row End-to-End**

Expected R4.6 behavior:

- mapping resolves the existing Task using canonical v1 schedule evidence,
- datetime step logs `DATE_TIME_CANONICAL_V1_VERIFIED`,
- datetime result is `NOT_NEEDED_CANONICAL_V1_MATCH`,
- no PreInspection schedule PATCH is attempted,
- Assignees / Install Notes / Calendar task-link steps continue normally,
- final refresh should show Task Start `12:00`, Task Due `13:00`, and `NO_ACTION` or equivalent verified no-patch state.

FIX-01 is not considered runtime-complete until this end-to-end canary passes through final refresh and Calendar-link verification.
