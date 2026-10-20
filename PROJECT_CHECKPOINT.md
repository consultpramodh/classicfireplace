# CF Tasks — V3 ACTIVE — Clean Rebuild

Checkpoint update: 2026-10-20 (America/Toronto).

## Service / Delivery verification repair — 2026-10-20

- Branch `fix/service-delivery-20261020`, based on canonical `task_mapping` commit `ff31ac706a590136bd7216bec68ac117931a5d0b`.
- Existing relationships without expected IDs now remain explicit REVIEW; independent safe fields may still be patched.
- Read-back checks unchanged relationships and Requested By type, Task type and status, in addition to intended changes, Customer and Task ID. Failure throws without retry.
- Executed locally: all Apps Script syntax checks and all eight task-first workflow regression scripts PASS, including 30 new Service/Delivery safety cases and the existing 185-case hardening suite.
- NOT DEPLOYED. Live `58_Operations` differs from repository. After fresh live capture/PRE backup, apply only changed `tmv3_repairExistingTaskRelationships`; preserve all other live functions and gates. Do not deploy this branch wholesale.
- Task 19198 Order/type incompatibility, Delivery schedules, identity/location ambiguity and multi-fireplace completion remain unresolved; this batch makes no live Task writes or compatibility claims.

## Execution access investigation — 2026-10-20

- Deployment inventory run 39484992048 verified one existing deployment with both WEB_APP and EXECUTION_API entrypoints. No deployment or access settings were changed.
- Current official scripts.run documentation requires the API deployment ID in the request path. GitHub runner previously sent the script project ID; corrected in commit 0676b85da7d31951ef48b717e33490ca7cc142b9.
- Non-mutating execution health check invokes only tmv3_servicePolicy. Run 39485143532 passed runner syntax validation but the API still returned PERMISSION_DENIED before function execution.
- Execution is NOT established. Google documents the same-Cloud-project requirement for the calling OAuth client and script; their alignment and full required OAuth scope coverage remain unverified.
- Next operator-assisted check: Apps Script Project Settings > Google Cloud Platform project, then compare with the Cloud project owning the OAuth client used by the existing GitHub authorization. Do not publish client secrets or tokens. Reauthorize only after identifying the mismatch; retain current deployment access restrictions.
- No Task writes, Apps Script source writes, new deployments, or permission expansions were performed by this investigation.

## Task data push attempt — 2026-10-20

- Source-read preflight succeeded: Actions run 39484326844. Exact deployed version is 3.11.95-preinspection-date-controls-and-notifications; canonical source hash is 4d49f011e822864b8ca073a8bdfd76d2271726d942212015bb16400378e9a929.
- Current deployed manualWritesEnabled=false and automationWritesEnabled=false; taskFirstProductionEnabled=true. Version-list access alone was not proof of executable access.
- Six deployed files differ from repository: 00_Config, 20_Striven, 58_Operations, 60_Automation, 70_Regression, 90_Admin. Do not overwrite these with repository copies.
- Bounded read-only reconciliation attempt through scripts.run failed with PERMISSION_DENIED (Actions run 39484474005). No Task writes were attempted and no Apps Script source was updated by these preflight modes.
- GitHub runner syntax validation passed. Preflight defaults restored to metadata-only to avoid repeated execution attempts.
- Service/Delivery data push remains BLOCKED: source parity and an authorized execution path must be established; global write flags must not be broadly enabled as a shortcut.

## Service and Delivery audit update — 2026-10-20

This update supersedes current-state interpretations of the October 13 checkpoint below; its historical evidence is retained.

- Live workbook audit: Service has 177 event rows (128 single-task matches, 2 multi-task matches, 5 blocked, 42 not run). Delivery has 12 event rows (8 matched, 4 not run). A match is not end-to-end verification.
- October 20 TM Audit records successful Service relationship patches with read-back, plus an HTTP 400 rejection stating that an Order cannot be associated with the Task type. Task-type compatibility remains unresolved.
- Delivery schedule exceptions, unresolved business anchors, Service identity/location ambiguity, multi-fireplace completeness, and false positive Location checklist indicators require repair.
- TM Reconcile still contains September 28 plans labeled 3.11.19. Overview says 3.11.81, canonical repository configuration says 3.11.90, and October 20 execution logs say 3.11.95. Exact deployed source parity is UNKNOWN.
- Local execution is unavailable and browser Apps Script access is policy-restricted. Google Sheets connector access works.
- Existing GitHub Actions workflow supports Google-authenticated read-only VERSION_INVENTORY. Access check requested by commit 49ea17f5a6894f2a868d191881b66f44e912f230; run https://github.com/consultpramodh/classicfireplace/actions/runs/39483379368. SUCCESS: inspected job logs show V3_VERSION_INVENTORY_COMPLETE, 200 versions (1–200), no next page. This verifies Google-authenticated Apps Script version-list access from Actions; it does not establish current HEAD source parity or production repair.
- No Service/Delivery source repair or production deployment is claimed by this documentation update.
- Next: capture exact deployed source through an authorized read-only workflow; back up and reconcile before preparing changed-file repairs and regressions. Preserve Service Task creation ownership in Striven's Work Order workflow.
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
