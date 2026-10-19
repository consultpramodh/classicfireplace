# Enternewpart — bounded queue repair (Google Apps Script)

Status: PREPARED, NOT DEPLOYED. 15 offline Node.js regression assertions passed.

This is a complete replacement for the supplied 04_actionhub.gs only, not a replacement for the whole project. Do not add it alongside another copy with the same functions. It depends on the supplied consolidated 01_config_menu.gs, 02_striven_core.gs and 03_enternewpart_sync_and_actions.gs. Never install it over an uninspected newer production copy.

Corrections:
- Correct SOId/SONumber mapping (previous generic lowercasing incorrectly requested sOId/sONumber).
- Reject incompatible header order without modifying existing headers or historical rows.
- Reject invalid State/Attempts values before queue processing.
- Re-read job under document lock to avoid executing a stale completed job.
- Verify source SO, quantity, description, SKU and eligibility before item creation and failure writeback.
- Retry explicit HTTP 429/5xx failures only, subject to the existing attempt limit; other errors become terminal REVIEW.
- Invalid retry dates and attempts cannot become runnable.

Intentional limitations / release blockers:
- enp_guardedPipelineTick is absent from all 15 supplied files. Its production implementation, callers and trigger configuration must be inspected before integration.
- This file does not repair the reported historical queue layout; it stops on incompatible data. Back up and reconcile historical jobs; do not simply rename headers and release 2,095 old jobs.
- It does not add a shared API budget or fix the unprovided full-catalog scanning implementation.
- Duplicate item-name validation failures stop in REVIEW. This does not authorize substituting another SKU or automatically renaming a product.
- Existing item lookup/create behavior and API payload shapes remain unchanged. Local report absence is still not authoritative proof that creation is safe.
- Sales Order write read-back verification and robust stable source identity remain required. The supplied source-row identity check reduces risk but is not a transaction or a substitute for coordinating report refreshes with the same lock.
- Existing RUNNING jobs are not automatically reclaimed, because a timed-out write may have succeeded remotely.
- Other entry points and legacy files are not patched. A direct create path may bypass these queue safeguards.

Deployment path:
1. Obtain the full live bound Apps Script source and triggers, including enp_guardedPipelineTick and guard modules.
2. Back up the exact live project to the authorized GitHub repository; verify the backup before any deletion or replacement.
3. Integrate these bounded changes into the actual authoritative implementation, preserving other live fixes; reconcile queue jobs and source identities.
4. Add shared API budget and targeted authoritative SKU resolution using verified API support. Add item/Sales Order read-back checks and durable checkpoints for uncertain writes.
5. Run one controlled case for SO 586037 / 27771 and SKU G190-0004-SER after resolving its identity; verify the correct SO line, quantity, price and completion log. Then enable small batches.

No Google or Striven calls were made by the offline test suite. No live files, items, Sales Orders, queue rows or triggers were changed in this turn.

Run offline tests from the original workspace root: node repairs/queue-preview/test_queue.cjs
The test suite loads the supplied config/core files from backups/2026-10-19-uploaded.
