# Preinspection event review and trigger comparison

Recorded 2026-10-27. This is an evidence-based review checklist, not proof that the whole workflow has been acceptance-tested.

## Steps used in the recent review

1. Read the authoritative CF Preinspects calendar and Stephen's discovery calendar for the selected time window. Deduplicate physical copies by event ID.
2. Inspect event date, title, description, address, existing links, and explicit visit intent. Calendar organizer and original creator are separate facts.
3. Identify explicit preinspection, other visit intent, or unknown. Exclude the specified creators only after original-creator provenance is verified.
4. Check the event's customer identifier, phone and address against customer and customer-owned location evidence. Conflicts remain review.
5. Where an order number is present, check the exact live order, customer ownership, status and job site; treat In Progress as review when order type is unverified. An absent order is optional for preinspection.
6. Find any linked or matching open task. Reuse one uniquely verified task; search fresh task history before create/recreate. An uncertain CREATE is reconciled before retry.
7. For a valid task plan, verify employee Requested By, customer, owned location, time, task name and Pool 8. Preinspection task Description is blank at create; field 854 is unmanaged; no order is attached merely for create.
8. Preserve authored Calendar notes and old title, repair approved clickable links and verify required calendar-copy parity. Verify the Striven task by readback, use v1 canonical desired schedule if the v2 time disagrees.
9. Evaluate notification timing and recipients independently; hold ambiguous creator or uncertain send. Publish sheet status and record queue counts and blockers.

## Deployed trigger alignment as inspected

- The 08:00, 13:00 and 17:00 handlers call the same canonical sweep. Intake scans CF and Stephen calendars, deduplicates copies, and applies discovery classification and creator exclusions to the secondary source.
- The stage 7 pipeline performs fresh identity and task checks, invokes the history-before-create and order-before-create gates, and executes the canonical write/readback and calendar parity functions.
- Version 3.12.17 holds an In Progress order for review when order type is unverified.
- Trigger work is batched: at most three events and one event mutation per execution, with continuation. This is not a guarantee that every queued event has completed.
- The lock-busy startup marker and recovery continuation passed simulated tests; a complete natural scheduled sweep and real lock-contention recovery still require live observation.
- The targeted read-only verification path avoids the full intake scan and returned NO_CHANGE for an already linked event on 3.12.16. The targeted production cycle still starts with broad intake and discovery; the verifier optimization does not remove that cost.
- Secondary-calendar discovery currently returns IGNORE for an unverified creator or insufficient phone/location evidence. The review goal of surfacing such cases is not equivalent to the current behavior and needs a designed, tested change.
- The sheet may be deferred to a later refresh. Lost-response recovery after a task write has not been demonstrated end to end. Do not replay a potentially successful create without authoritative reconciliation.
- Preinspection appointment processing does not establish that completion-to-Install handoff or printing is fully automated; evaluate those workflows separately.

## Live acceptance needed

Observe a scheduled sweep with eligible/attempted/remaining/review counts, through completion and a second idempotent run. Verify recovery from lock contention and uncertain CREATE without duplicate tasks, measure per-stage duration and API calls, and verify sheet timestamp and current contents. No full production sweep was run for this documentation.
