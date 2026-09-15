# Task Mapping Fix Pack R4 — Deployment Evidence

**Release:** `TASK_MAPPING_FIX_PACK_R4_20260915`  
**Branch:** `task_mapping`  
**Apps Script:** existing bound production project  
**Deployment run:** `35008409555`  
**Deployment job:** `104513907947`  
**Artifact:** `10412816389`  
**Artifact SHA256:** `47b5d3ad540f8928d934fb6a932ac7e5e5a702a2c16a793ce9d0bd7940ecd752`

## Deployment result

- `DEPLOYED_SOURCE_VERIFIED`
- PRE clone: 58 files
- POST clone: 59 files
- Added: `97_Task_Mapping_Fix_Pack_R4.js`
- Modified existing files only:
  - `02_Menu.js`
  - `01_Shared_Utilities.js`
  - `40_Report_Refresh_Workflow.js`
  - `92_Striven_Task_Patch_Helper.js`
  - `95_Delivery_Calendar_Link_Test.js`
- All other PRE files hash-preserved.
- PRE source retained in the workflow artifact as rollback evidence.
- Production TM2 cutover flags were not changed.
- Runtime regression is still required; source deployment success is not being treated as feature verification.

## Fix tracker

| ID | Fix | R4 source status | Runtime status |
|---|---|---|---|
| FIX-01 | PreInspection AM/PM date-time reconciliation | DEPLOYED — R4 routes OPEN PreInspection through R3 local-meridiem sequential PATCH/read-back | PENDING regression/write test |
| FIX-02 | Shared rolling 24-hour recently-completed protection | DEPLOYED — automatic recovery source guard now delegates to rolling 24-hour guard | PENDING runtime evidence |
| FIX-03 | Prevent blind retry after uncertain writes | DEPLOYED in consolidated selected-row path; fresh state is read before deciding whether a mutation is needed; existing guarded recovery remains reconcile-before-retry | PENDING runtime evidence |
| FIX-04 | Material selected-row write read-back | DEPLOYED — consolidated selected-row path requires authoritative task read-back before Calendar link write; Service Calendar link write has read-back | PENDING runtime evidence |
| FIX-05 | Separate OPEN / recent completion / completed-review / recovery handling | DEPLOYED in consolidated selected-row + automatic recovery guard | PENDING runtime evidence |
| FIX-06 | Service multi-fireplace event-level link aggregation | DEPLOYED — Service rows grouped by Event ID; one managed link block contains all task links; write read back | PENDING dry-run/runtime evidence |
| FIX-07 | Calendar freshness before selected-row consequential work | DEPLOYED — authoritative Calendar event is re-read and compared before selected-row write path | PENDING runtime evidence |
| FIX-08 | Duplicate prevention immediately before CREATE/RECREATE | PRESERVED — existing guarded recovery execution re-plans immediately before create/recreate; R4 does not bypass it | PENDING regression evidence |
| FIX-09 | PreInspection organizer → exact Employee Requested By | PRESERVED + INCLUDED — selected-row PreInspection path retains exact organizer-to-employee resolution; prior runtime evidence already showed exact Employee resolution | Regression pending |
| FIX-10 | Valid zero-row report vs failed/malformed report | DEPLOYED — recognized empty array is valid; unknown/malformed shape throws before sheet replacement; pagination cap throws | PENDING regression |
| FIX-11 | Separate legacy mapping status from TM2 endpoint | DEPLOYED — Control Tower shows legacy status and TM2 endpoint separately | PENDING UI regression |
| FIX-12 | Exception-first operational display | DEPLOYED — Master menu Control Tower modal with workflow summaries + exception queue | PENDING UI regression |
| FIX-13 | One consolidated regression suite | DEPLOYED — `runTaskMappingFixPackR4Regression()` | PENDING one-click run |
| FIX-14 | Recent completions cannot be automatically recreated | DEPLOYED in selected-row and automatic recovery paths through rolling 24-hour protection | PENDING runtime evidence |

## New Master menu controls

- `🧭 Task Mapping Control Tower`
- `🧪 Run R4 Read-Only Regression`

All existing `🚀 Run Selected Row End-to-End` menu entries now route to `runSelectedTaskMappingRowEndToEndR4()`.

## Exact next verification

Run **Master Sync → 🧪 Run R4 Read-Only Regression** once. This regression makes no Striven or Calendar business-data writes. It runs the consolidated read-only checks, TM2 shadow suite, Service link dry-run, report parser checks, and Control Tower data build. After that evidence is reviewed, perform one controlled selected-row write test for the PreInspection AM/PM case.
