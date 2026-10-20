# Service and Delivery Order backfill — 2026-10-20

User explicitly authorized processing all 55 Service and 26 Delivery open Tasks whose Source Tasks Order ID is blank, without the one-per-hour wait.

The fixed 81 Task IDs are in `release-candidates/tmv3-service-delivery-order-backfill-20261020.json`. Source Tasks and all 8,298 Source Orders rows were read before enrollment. These are candidates, not 81 proven missing live relationships. The fresh Task GET is authoritative.

## Execution

- Existing authorized native scheduled/hourly worker starts the one-time queue before its ordinary hourly throttle.
- At most 8 candidates, approximately 56 Striven calls and 120 seconds per slice; continuation after at least 60 seconds. An advance 180-second continuation recovers a hard timeout. Only the dedicated backfill continuation trigger is replaced or deleted.
- Every Task requires unique source identity, fresh open status and correct Service/Delivery type, a unique SO# title, one compatible cached Order identity, then fresh Order ID/number/Customer/active-status proof.
- User-provided 19198 / SO586061 / Order27795 identity is available even if absent from cache; cancellation still blocks it through fresh proof.
- Existing guarded relationship writer receives only Customer and Order expectations; no Contact, Location, dates, assignments, Task creation, notes, Calendar or PreInspection mutations in this backfill.
- Durable per-Task INTENT precedes PATCH. Fresh readback verifies the exact Order, Customer, Task ID/type/title/open status. An interrupted write gets one fresh reconciliation; an unconfirmed result is parked, never blindly retried by either queue or normal worker.
- Transient failures before a write get at most three attempts. Cancelled/inactive, missing/ambiguous anchors, conflicts and wrong identities are recorded individually; other Tasks continue.
- Global write flags, per-transaction permission gate, existing schedules, API daily brake, Install and PreInspection functions remain unchanged. The fixed-ID exception does not increase routine throughput permanently.

## Verification

22 executed batch tests include all 81 IDs through 12 mocked automatic slices, both verticals, duplicate/ambiguous/missing Orders, missing/multiple title numbers, existing relationships, closed Tasks, wrong identities, failed readback, interrupted writes, transient read failures, daily budget and preservation of unrelated triggers. Existing 43 autonomous-details tests and relationship/production-lane regressions also pass.

Live deployment and native batch outcomes are pending; source deployment alone is not evidence of Task patches.
