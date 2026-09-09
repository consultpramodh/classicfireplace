# Task Mapping — Available Deployment / Release History

Last updated: 2026-09-09

This folder records deployment/release evidence that is available from verified project execution logs and prior source snapshots.

## Important limitation

This is **not** the canonical Google Apps Script deployment/version list. The currently connected tooling does not expose the bound Apps Script project's `projects.versions.list`, `projects.deployments.list`, or a direct authenticated `projects.getContent` read.

Do not use this document as proof that every Apps Script version/deployment is represented. It is an audit trail of the deployment evidence currently available to the project.

## Verified release evidence

| Release / checkpoint | Date | Evidence / outcome available |
|---|---|---|
| TASK RECOVERY ALL WORKFLOWS R1.7 | 2026-09-02 | Live Task Mapping project pulled as 36 files; task recovery integrated into Install, Delivery, Service and PreInspect workflows; remote source reported SHA-verified by the execution package. |
| PreInspect R2.6 | 2026-09-05 | 36-file live project pull; exact PreInspect create/recovery files patched and verified in execution package. |
| PreInspect R3.2 | 2026-09-05 | Field 854 + unique SO + Push All work; exact live project pull before patch. |
| PreInspect R3.3 | 2026-09-05 | 36-file live project pull/push; PreInspect menu/manual-push integration. |
| PreInspect R3.4.2 | 2026-09-05 | 36-file live project pull/push; customer/date-time end-to-end work. |
| PreInspect R3.4.4c | 2026-09-05 | 36-file live project pull/push; Requested By region fix. |
| PreInspect R3.4.6 | 2026-09-05 | Field 854 task PATCH route; file 35 changed with syntax/inventory verification. |
| PreInspect R3.4.6c | 2026-09-05 | Read-only custom-field metadata inspection; file 35 changed with syntax/inventory verification. |
| PreInspect R3.4.8 | 2026-09-05 | Task Description blank-on-create; technician fields not prefilled; field 854 ownership assigned to dedicated writer. |
| PreInspect R3.4.14a | 2026-09-05 | Calendar-link safety/hyperlinks; file 35 changed; static business-rule regression checks passed. |
| PreInspect R3.4.20a | 2026-09-09 | Schedule-gate contract functions present and contract test passed; separate Task 18241 schedule-gate regression later returned `pass:false`, so this release must not be treated as fully feature-verified. |

## Known live project inventory evidence

Multiple September 2026 clasp execution logs report a **36-file** live Apps Script project. Confirmed file names include:

- `00_Config.js`
- `000_testing.js`
- `01_Shared_Utilities.js`
- `02_Menu.js`
- `10_Install_Workflow.js`
- `20_Delivery_Workflow.js`
- `30_Service_Workflow.js`
- `31_Service_Calendar_Workflow.js`
- `35_PreInspect_Task_Review.js`
- `36_PreInspect_Task_Create.js`
- `40_Report_Refresh_Workflow.js`
- `90_Testing_Diagnostics.js`
- `91_Trigger_Setup.js`
- `92_Striven_Task_Patch_Helper.js`
- `92_TESTING_Striven_Task_Patch_Helper.js`
- `95_Delivery_Calendar_Link_Test.js`
- `99_1_TestCodeAudit.js`
- `99_Function_Connectivity_Audit.js`
- `approvedSalesOrders.js`
- `appsscript.json`
- `attachments.js`
- `auth.js`
- `calendar.js`
- `Copy of main.js`
- `customers.js`
- `dashboard.js`
- `debug.js`
- `deliveries_calendar.js`
- `deliverymapping.js`
- `installtasks.js`
- `locations.js`
- `main.js`
- `proxy.js`
- `reminder.js`
- `service.js`
- `striventasks.js`

## Source-sync status on 2026-09-09

- Existing GitHub pre-sync state preserved on branch `task-mapping-full-backup-20260909`.
- Working branch remains `task_mapping`.
- The workbook tab `Code Audit Source` was inspected as a potential current source export.
- That tab is incomplete/stale for this purpose: it contains core Task Mapping files but does **not** contain the live PreInspect source (`35_PreInspect_Task_Review.js` / `36_PreInspect_Task_Create.js`) even though those files are proven to be in the live 36-file Apps Script project.
- Therefore no misleading “full current source” snapshot was committed from that tab.

## Required next source capture

Obtain one authenticated current Apps Script content export (`clasp pull` or Apps Script API `projects.getContent`) of the live bound project. Once that export is available, commit all 36 files together as one dated immutable snapshot and verify file inventory/hash parity.
