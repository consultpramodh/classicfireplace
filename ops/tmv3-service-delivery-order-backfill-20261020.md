# Service and Delivery Order backfill — completed 2026-10-20

The user authorized all55 Service and26 Delivery Tasks whose report-cache Order ID was blank. Final live outcomes were68 new Order links patched and verified,2 links already present,11 held,0 pending and0 uncertain.

| Vertical | Captured | Patched | Already linked | Held |
| --- | ---: | ---: | ---: | ---: |
| Service |55|50|1|4|
| Delivery |26|18|1|7|
| Total |81|68|2|11|

Every patch required an existing open correct-vertical Task, unique SO# title, compatible cached identity or complete official Number/CustomerId search result, and fresh Order identity/Customer/active-status proof. Only the Order field was sent to the existing guarded relationship writer. It preserved other relationships, dates, assignments, names and notes.

The fixed queue runs before the ordinary hourly throttle. It persists INTENT before mutation, verifies by fresh GET, reconciles interrupted writes without blindly retrying, and requeues a consumed continuation after Calendar lock collisions. The final pacing threshold limits each slice to at most40 calls (32-call starting threshold plus one bounded transaction), with at least one minute between timer-slice starts and no extra idle minute after slow work. The daily API brake stays in force. No general write flags or Install/PreInspection functions were expanded.

The official OpenAPI document was read in Action39498743786: POST /v1/sales-orders/search uses Number,CustomerId,PageIndex,PageSize and returns Data/TotalCount. Search completeness, exact number/Customer, unique ID and a subsequent authoritative Order GET are mandatory. Existing Delivery Task linking also accepts SALES_ORDER identity without requiring a Calendar delivery-approved report row.

The native final tally69 VERIFIED/12 BLOCKED differs from the link-outcome table because19098 already has Order27661 but failed the condition for making a new link to an active Order. A fresh cache-only GET confirmed the existing link. All68 new patches have native readbackVerified audit records.

Current cache was independently reconciled after detecting omitted IDs and a duplicate19281/displaced16025 row. Fresh API reads restored the old row, removed the duplicate and filled omitted Order IDs, with zero Striven mutations and a private pre-repair backup. All81 target IDs are present exactly once; all68 patched Order IDs match. The source of the cache discrepancy remains unconfirmed.

Tests executed:36 actual worker/batch cases,14 cache-only cases,11 expiring-auth cases,37 deployment checks,43 existing details cases and the relationship/status/production-lane regressions.

See the results JSON for each Task, the held reasons and exact source hash. The completed fixed queue does not imply all Task detail fields or the entire vertical are production-verified.
