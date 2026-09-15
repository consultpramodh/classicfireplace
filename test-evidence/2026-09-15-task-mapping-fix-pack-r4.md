# Task Mapping Fix Pack R4–R4.7 — Deployment & Runtime Evidence

**Base release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Current release:** `TASK_MAPPING_FIX_PACK_R4_7_20260915`  
**Branch:** `task_mapping`  
**Apps Script:** existing bound production project  
**TM2 production cutover:** OFF

## Deployment history

- **R4:** consolidated selected-row safety/readback/report/control-tower fix pack; production source verified.
- **R4.1:** corrected Service Calendar lookup to include live `SERVICE_CONFIG.TECH_CALENDARS`; read-only consolidated regression passed with 0 business workflow writes.
- **R4.2:** corrected authoritative PreInspection Calendar lookup.
- **R4.3:** tested local 24-hour ISO transport after earlier PI PM transports failed.
- **R4.4:** added bounded retry only for the explicit no-write ScriptLock error and lock protection around PI datetime reconciliation.
- **R4.5:** quarantined known-bad Task Type 105 afternoon v2 datetime PATCH attempts and added read-only v1/v2 schedule diagnostic.
- **R4.6:** uses v1 `DesiredStartDate` / `DesiredEndDate` as canonical PI schedule when v2 conflicts with Calendar.
- **R4.7:** adds canonical v1 verification for PreInspection custom field 854 (Install Notes), plus no-blind-retry handling after an uncertain Field 854 write.

## R4.6 schedule diagnosis and runtime result

Controlled row: **PreInspect Task Mapping row 11**  
Event ID: `5ib34vdtqbe0l8bjmnj5fqd1tp@google.com`  
Task ID: `18476`  
Calendar: **2026-09-16 12:00 → 13:00**

The R4.5 diagnostic showed:

- v2 Start: `2026-09-16T12:00:00-04:00`
- v2 Due: `2026-09-16T01:00:00-04:00`
- v1 Desired Start: `2026-09-16T12:00:00`
- v1 Desired End: `2026-09-16T13:00:00`

The same v1/v2 PM discrepancy existed on reference Task `18309`. Therefore R4.6 treats v1 Desired Start/End as canonical when the PI v2 schedule conflicts with Calendar.

The subsequent selected-row R4.6 runtime canary confirmed the fix:

- Mapping: `MATCHED` / `NO_ACTION`
- Customer 62488: `NOT_NEEDED`
- Location 58134: `NOT_NEEDED`
- Requested By: Employee 20 Spencer Bambek, `CALENDAR_ORGANIZER_EMAIL_EXACT_EMPLOYEE`
- Date/time action: `DATE_TIME_CANONICAL_V1_VERIFIED`
- Date/time status: `NOT_NEEDED_CANONICAL_V1_MATCH`
- Canonical v1: `12:00 → 13:00`
- No datetime PATCH was attempted.

**FIX-01 is runtime PASS for Task 18476.**

## Field 854 failure isolated after datetime passed

The same R4.6 canary then continued past datetime and assignments:

- Assignee Pool 8 was added and verified.
- Existing Employee 6 assignment was preserved.

It then failed on PreInspection custom field 854 `Install Notes`.

Observed evidence:

- desired type: string
- desired semantic length: 395
- v2 read-back type: null
- v2 read-back semantic length: 0
- error: `R3.4.6a Field 854 verification failed: material read-back text differs from requested Install Notes.`

The historical Field 854 route used `PATCH /v2/tasks/{id}` with the full current `InfoCustomFields` array, replacing only Field 854. Its original proof was a no-op full-array PATCH, so it proved parity but did not prove that a changed Field 854 value would persist on every task.

Because Task 18476 already received a 2xx/uncertain mutation followed by a null v2 read-back, the correct state is **UNCERTAIN_WRITE**, not an automatic retry.

## R4.7 behavior

R4.7 changes only the PI Field 854 selected-row write/verification contract:

1. Read v1 Task `CustomFields` before any new Field 854 mutation.
2. If v1 Field 854 already semantically equals the requested Calendar notes, return `NOT_NEEDED_CANONICAL_V1_MATCH` and perform **no write**.
3. Task `18476` is explicitly treated as a known prior uncertain Field 854 write. If canonical v1 does not confirm the requested value, block with `BLOCKED_FIELD854_UNCERTAIN_WRITE` before another mutation.
4. For a different task with no uncertainty marker, allow at most one conservative full-`InfoCustomFields` v2 PATCH.
5. A 2xx PATCH is not success by itself. v1 Task `CustomFields` must confirm Field 854 afterward.
6. If v1 does not confirm after a 2xx write, save a Script Properties uncertainty marker and return `UNCERTAIN_WRITE`; future attempts cannot blindly rewrite it.
7. If v1 confirms, the workflow still checks v2 non-854 custom-field parity so unrelated custom fields cannot silently change.

R4.7 does not invent a new undocumented Striven custom-field write endpoint.

## R4.7 guarded deployment

- GitHub Actions run: `35020571462`
- Job: `104554899522`
- Result: `DEPLOYED_SOURCE_VERIFIED`
- PRE file count: 59
- POST file count: 59
- Intentionally modified live files only:
  - `35_PreInspect_Task_Review.js`
  - `97_Task_Mapping_Fix_Pack_R4.js`
- Every other live file was hash-preserved by the guarded deployment.
- Artifact: `task-mapping-fix-pack-r4-7-35020571462`
- Artifact ID: `10417676318`
- Artifact SHA256: `d9fc6807868c57264cbb734b580176a2adfea2f6fdab4117f46364cee6a86616`
- No triggers were added.
- TM2 cutover remained OFF.

## Updated fix tracker

| ID | Fix | Source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection date/time reconciliation | **R4.6 DEPLOYED** | **PASS — Task 18476 canonical v1 schedule matched fresh Calendar; no datetime PATCH** |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED | Runtime case test required |
| FIX-03 | Prevent blind retry after uncertain writes | **R4.7 strengthened for Field 854** | **PASS safety behavior observed; Task18476 will not be blindly rewritten** |
| FIX-04 | Material selected-row write/readback verification | DEPLOYED | **PASS fail-closed behavior observed** |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED | Runtime case test required |
| FIX-06 | Service multi-fireplace event-level link aggregation | R4.1 DEPLOYED | Read-only pipeline PASS; production multi-fireplace runtime case pending |
| FIX-07 | Calendar freshness before consequential selected-row work | R4.2 DEPLOYED | **PASS on controlled PI attempts** |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED | Targeted recovery regression required |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED | **PASS repeatedly — Task18476 Employee20 Spencer Bambek** |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED | **PASS** |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED | Data-build PASS; visual review pending |
| FIX-12 | Exception-first operational display | DEPLOYED | Data-build PASS; visual review pending |
| FIX-13 | Consolidated regression suite / selected-row E2E | DEPLOYED | Read-only suite PASS; PI E2E currently blocked only on Field854 canonical result |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED | Runtime case test required |

## Current next verification

Refresh/reopen the spreadsheet, keep **PreInspect Task Mapping row 11 / Task 18476** selected, then run:

**🚀 Run Selected Row End-to-End**

Expected R4.7 outcome:

- datetime remains `DATE_TIME_CANONICAL_V1_VERIFIED` with no datetime write;
- Pool 8 should now be `NOT_NEEDED` or otherwise already verified;
- Field 854 performs a v1 canonical pre-read first;
- if the prior Field 854 mutation actually persisted and v2 merely represented it incorrectly, result should be `NOT_NEEDED_CANONICAL_V1_MATCH` and the workflow will continue to Calendar link/final refresh;
- if v1 does not contain the requested notes, Task18476 must stop with `BLOCKED_FIELD854_UNCERTAIN_WRITE` **before another Field 854 write**.
