# Native triggers and legacy flow parity — 2026-10-23

Scope: CF Tasks V3 Task Mapping only. ServiceOps intake/web interface and Central Hub are separate Apps Script projects; their deployment numbers and schedules must not be presented as this project's state.

## Evidence
- Live source read and native trigger inventory: Actions 40005739979; artifact 12524381077.
- V3 project: 1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt.
- Exact inspected source hash: 64a37d2cf96b9e9b51ad95e362f4a05b58424c061bc6c6daedf1028fbd089ac1.
- Legacy Task Mapping source captured directly from project 1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m, hash 488fb7d52dd9e78fa25e0d6824ccf7fc6d8f35c40ae4c08a7c147d48df9935d1.
- Separate ServiceOps source captured from 1QZp4NAFeA8LmWBN31ylJYdK4XFepBX1h2lP_APaR-d1lTAC-d8LA9x3g, not mutated.
- Installer execution: Actions 40006186933. Both existing native installers returned successfully. External verification initially failed because it expected seven Calendar watchers; live installer correctly selects six authoritative intake Calendars and omits Stephen's mirror. This is not a failed installer or proof that all business actions work.
- Independent read-only acceptance: Actions 40006405467 SUCCESS. Two fresh inventories returned NATIVE_TRIGGER_INSTALL_READBACK_VERIFIED: 17 recurring triggers, six unique authoritative Calendar watchers, five operational slots, three PreInspection slots, one daily source refresh, one reminder and one hourly fallback. Full source hash remained unchanged.
- No Apps Script source push, business-field write, permission expansion, immutable version creation, or existing web deployment update is performed by these tools. Trigger changes execute current HEAD; no code release is implied.

## Installed native schedule

All times use the live project timezone America/Toronto. Clock times are approximate Apps Script windows, not minute-exact guarantees.

| Purpose | Handler | Schedule/count |
|---|---|---|
| Shared source refresh | tmv3_dailySourceRefresh | Daily near 07:00 |
| Operational mapping plus dedicated existing-Task worker | tmv3_scheduledOperations | Daily near 08:30, 11:30, 13:30, 15:30, 17:30 |
| Install missing-SO reminder check | tmv3_installReminderCheck | Daily near 11:00; current handler is gated at Stage 7 |
| Recovery/source freshness/mapping plus dedicated worker | tmv3_calendarReconciliationFallback | Hourly; business work limited by handler to 08:00–18:59 |
| PreInspection complete eligible sweep | tmv3_preInspectionCheck0800 / 1300 / 1700 | Daily near 08:00, 13:00, 17:00, with bounded continuation |
| Calendar changes | tmv3_calendarEventUpdated | Six authoritative Calendars: Install, Delivery, three Service technicians, CF Preinspects |

Expected recurring count: 17. A temporary PreInspection continuation can legitimately increase it. Stephen's Calendar is mirror-only, consistent with current source/business rules. Trigger inventory is visible for the executing owner; it does not establish absence of another owner's triggers.

## Legacy parallels and required final flow

Live legacy files inspected: 91_Trigger_Setup, 10_Install_Workflow, 20_Delivery_Workflow, 30_Service_Workflow, 35_PreInspect_Task_Review.

Legacy unified operational slots call each division independently; one division failing does not abort all others. Legacy also defines six refresh/rebuild/link slots at 08:00/10:00/12:00/14:00/16:00/18:00. Its PreInspection scheduled pipeline explicitly refreshes, reviews identity, resolves one safe Location-first case, processes one safe Task creation/recreation case, reconciles open Task schedule/Requested By, and normalizes names.

Required shared flow: refresh due sources → ingest eligible Calendar changes → resolve business anchor → certify Customer/Location/Requested By → discover exact Task and apply lifecycle gate → execute only safe canonical Step 7 actions → independently read back → update managed Calendar links and operator status → continue queued work or alert on failure. Preserve the latest V3 business rules when legacy behavior differs; do not restore obsolete Field 854 writes or substitute Service Task creation.

| Vertical | Required ownership and execution |
|---|---|
| Install | Exact SO and current In Progress prerequisite → verified Customer/job Location/contact → discover Striven-created Task → schedule and title-only installer evidence → guarded details and Task link → read-back/status |
| Delivery | Required SO and verified Customer-owned job Location → exact Delivery Task → dates/title-only assignment evidence → guarded details and SO/Task links → read-back/status |
| Service | ServiceOps owns request/customer/contact/location/SO/WO; Striven WO workflow creates the Service Task → Task Mapping discovers exact task(s) → technician-Calendar assignment and schedule → WO/Task links → read-back/status; never create substitute Service Tasks |
| PreInspection | CF Preinspects → eligibility/creator exclusions → verified Customer and Calendar job-site Location → safe Location-first action if needed → Type 105 history/duplicate decision → existing Task reconcile or guarded create → dates/Requested By Employee/Pool 8/name → managed links and required mirror parity → read-back/status; SO optional, Description blank at create, Field 854 unmanaged |

## Remaining execution blockers — not cured by reinstalling schedules

1. TMV3_EXECUTION_STAGE remains 7. General production and refresh/link functions stop at CALENDAR_STAGE_GATED.
2. General manualWritesEnabled and automationWritesEnabled remain false. Dedicated PreInspection and existing Service/Delivery scopes work independently and require these false flags; flipping the global automation flag would disable those scopes under current policy checks.
3. Install reminder's scheduled handler returns CALENDAR_STAGE_GATED at stage <=7 even though the reminder feature flag is true.
4. General automatic Calendar link writer requires AUTO scope, currently disabled. Six legacy refresh/link clock wrappers are absent from current installer; adding them unchanged would still hit the Stage 7 gate and would duplicate refresh work.
5. Existing Service/Delivery routine worker still shares a one-candidate/hour allowance. A completed fixed backlog repair does not prove routine throughput, full-field acceptance, or full vertical readiness.
6. No natural post-install scheduled business outcome is verified by installation/read-back alone.

Next implementation must close these scoped execution gaps and test affected fresh Step 7 contracts before production source changes. Do not use installation as justification to bypass ownership, lifecycle, duplicate, API-budget or read-back checks.
