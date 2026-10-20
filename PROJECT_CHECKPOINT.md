# CF Tasks — V3 ACTIVE — Clean Rebuild

Checkpoint update: 2026-10-20 (America/Toronto).

## Service and Delivery audit update — 2026-10-20

This update supersedes current-state interpretations of the October 13 checkpoint below; its historical evidence is retained.

- Live workbook audit: Service has 177 event rows (128 single-task matches, 2 multi-task matches, 5 blocked, 42 not run). Delivery has 12 event rows (8 matched, 4 not run). A match is not end-to-end verification.
- October 20 TM Audit records successful Service relationship patches with read-back, plus an HTTP 400 rejection stating that an Order cannot be associated with the Task type. Task-type compatibility remains unresolved.
- Delivery schedule exceptions, unresolved business anchors, Service identity/location ambiguity, multi-fireplace completeness, and false positive Location checklist indicators require repair.
- TM Reconcile still contains September 28 plans labeled 3.11.19. Overview says 3.11.81, canonical repository configuration says 3.11.90, and October 20 execution logs say 3.11.95. Exact deployed source parity is UNKNOWN.
- Local execution is unavailable and browser Apps Script access is policy-restricted. Google Sheets connector access works.
- Existing GitHub Actions workflow supports Google-authenticated read-only VERSION_INVENTORY. Access check requested by commit 49ea17f5a6894f2a868d191881b66f44e912f230; run https://github.com/consultpramodh/classicfireplace/actions/runs/39483379368. Result pending at the time this update was written.
- No Service/Delivery source repair or production deployment is claimed by this documentation update.
- Next: verify Actions access result; capture exact deployed source through an authorized read-only workflow; back up and reconcile before preparing changed-file repairs and regressions. Preserve Service Task creation ownership in Striven's Work Order workflow.
- The unavailable Verification Council skill was not executed; findings derive from checked workbook data, audit records, and repository files.

## Historical checkpoint — 2026-10-13

## Active source

- Repository: `consultpramodh/classicfireplace`; canonical branch: `task_mapping`.
- Bound Apps Script: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`.
- Workbook: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`.
- Source directory: `apps-script/tmv3-clean/`; 22 live files source/hash verified.
- Current engine: `3.11.81-task-first-authoritative-audit-r1`; execution stage: 7.
- Mode: `PRODUCTION_WRITE`, strictly restricted to the existing Service/Delivery task relationship lane. Manual and general automation write flags remain false; CREATE, schedule, assignment and Calendar mutations are not enabled by this permission.

## Resolved and verified

1. Existing-task relationship worker enabled, independent of Calendar appointments. It considers one cached candidate per 60-minute interval, performs fresh Task/Order/Contact ownership verification, patches only missing safe relationships and requires read-back.
2. Existing hourly `tmv3_calendarReconciliationFallback` now invokes the bounded lane during 08:00–18:59 Toronto time. Five existing daily `tmv3_scheduledOperations` triggers use the same throttle. No triggers were deleted, replaced or added.
3. Live worker Task 19098: ORDER and REQUESTED_BY patched; `PATCHED_AND_VERIFIED`, writes=1. Immediate second call: `THROTTLED`, writes=0. This controlled execution cost 10 Striven API calls, with zero failures and zero budget blocks.
4. Independent fresh Task read-back: Customer 56491, Order 27661 / number 585927, Location 52482, Requested By Contact 50483. Location and Customer were existing values, not patched by this cycle.
5. False audit ownership warning fixed: missing Customer ID in cached Orders is no longer treated as proof of conflict. One targeted fresh Order GET proves ID, order number and Customer ownership; live read-back returned `customerOwnershipVerified=true` and `FRESH_STRIVEN_ORDER_GET`.
6. All 185 hardening regression cases passed on live Apps Script 3.11.81. Targeted Node regressions also passed, including 20 worker cases, 15 hourly path combinations, action isolation, temporary canary safety and 8 audit ownership cases.

## Evidence and rollback

- 3.11.80 guarded deployment: Actions `38445040253`; exact PRE source matched commit `b191cc9ade666bfcf852e8b73bc9c42a74a3a834`.
- Controlled live worker / repeat throttle: Actions `38445176665`; artifact `11837543418`.
- Separate read-back: Actions `38445417279`.
- 3.11.81 source commit: `9eaac3b5e200e9a659be6df9cd639d1f5111cdce`.
- 3.11.81 guarded deployment: Actions `38445911149`; exact PRE source matched `ac8534870881906b1ba005783a26294eef5a2cfd`; PRE source preserved; post-push re-clone/hash parity passed.
- Authoritative audit runtime: Actions `38446041472`.
- Final live hardening: Actions `38446196732`; artifact `11837404690`; all 185 PASS, source HEAD hash verified after runner restoration.
- Immediate pre-audit rollback source: commit `ac8534870881906b1ba005783a26294eef5a2cfd` (3.11.80).
- Full pre-activation rollback: commit `b191cc9ade666bfcf852e8b73bc9c42a74a3a834` (3.11.79, SHADOW_READ_ONLY, relationship lane disabled).

## Remaining / exact next action

The complete four-vertical system is not declared end-to-end production verified. The bounded lane preserves missing/conflicting Location as review and does not create Customers, Locations or Tasks. General schedule/assignment/Calendar/CREATE/RECREATE permissions remain gated. A naturally scheduled execution after activation has not yet been observed in this checkpoint; the controlled worker execution, trigger presence and hourly entrypoint regression are verified separately.

Next: inspect current eligible four-vertical Step-7 plans without broad write activation; select fresh exact canaries for the remaining schedule/assignment/Calendar-link lifecycle checks. Preserve all business rules in `CURRENT_DECISION_REGISTER.md`; Service Task creation remains owned by Striven's Work Order workflow.
