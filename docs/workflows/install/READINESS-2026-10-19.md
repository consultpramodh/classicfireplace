# Install readiness repair — 2026-10-19

Status: prepared and locally tested; NOT deployed or accepted live.

Base: task_mapping commit 005dc0557085d58c41ee37a15bc1b188043cbd01.
PreInspection release changes on its separate branch are not included or overwritten.

## Implemented

- Seven-day Install-only readiness audit, capped at 25 events and stopped when API headroom is insufficient. Reports Customer, SO, Location, Requested By/contact ownership, dates, assignment, actions and exact blockers. A snapshot never certifies live readiness.
- Disabled exact-event Install existing-task permission; general/manual writes remain disabled. Requires Stage 7, production mode, one configured Event ID, one Open Task and required relationship IDs. Canonical Stage 7 still proves ownership before mutation.
- Existing scheduledOperations can invoke this lane; manual editor/menu entrypoint uses the same guards. Weekdays 07:00–18:59 Toronto, scheduled throttle at least 60 minutes, script lock, budget guard and fresh event/plan reads.
- Stale or absent master/transaction cache timestamps block execution. This lane does not invoke shared bulk refreshes.
- Only date, Location, SO, Requested By, assignment and Calendar Task-link actions are accepted. CREATE/RECREATE, Location creation, Calendar-title changes and Task renaming stay blocked.
- Requires a fresh terminal NO_CHANGE plan for the same Install event/Task and verified Calendar links; partial/uncertain execution cannot count as complete. No new outgoing alerts.

## Validation executed

All 21 JavaScript source files passed Node syntax checks. Install regression: 81 checks covering permission isolation, stale caches, time/budget/lock gates, invalid dates, ambiguous/blocked plans, prohibited actions, uncertain writes, readback, and bounded read-only audit. Existing hardening suite (185 cases) and existing notification/intake regression passed locally.

## Still required before live

1. Reconcile this patch with the exact bound source and pending PreInspection branch; back up live source before deployment.
2. Run the readiness audit against actual Install events and resolve each blocker. Verify actual source refresh persistence first.
3. Select one future Install event and prove every required field, Calendar link and zero-write repeat using authoritative readback. Observe a naturally scheduled execution.
4. Verify installed triggers and check that legacy writers cannot compete.
5. Accept CREATE/RECREATE separately with fresh duplicate/history checks, recovery and uncertain-write reconciliation. This patch deliberately does not activate that lifecycle.
6. Add full queue coverage/continuation and failure-alert acceptance before claiming unattended coverage. An exact-event canary is not a production queue.

Do not merge or activate solely because local tests pass. Direct live source/Sheet access was unavailable during preparation.
