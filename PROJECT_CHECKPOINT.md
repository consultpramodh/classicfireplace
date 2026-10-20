# CF Tasks — V3 ACTIVE — Clean Rebuild

Checkpoint update: 2026-10-20 (America/Toronto).

## Active-Order repair guard — 2026-10-20

- User identifies SO 586061 / ID 27795 as canceled. Task type incompatibility is not established by the prior HTTP 400. Exclude this exact SO from the native worker pending operator review; do not cancel Task 19198 or invent a replacement Order.
- Other inspected cached OPEN candidates include Service 19201, 19203, 19218 and Delivery 19190, 19195, 19204, 19205, 19206 and 19214. Cached identity columns are often omitted; every write still requires fresh Task/Order/Contact evidence.
- Prepared two-function native-path update: authoritative Order proof requires Approved (22) or In Progress (25), rejects unknown/conflicting/inactive statuses, and returns only verified Order contact ID. Worker uses that shared proof before repair. Repeat ownership verification in writer protects changes between preflight and PATCH. Official status mapping: https://api.striven.com/Help/StaticLists.
- Existing one-candidate/60-minute throttle and write permissions preserved. No date/assignment/Calendar or CREATE activation. Deployment uses durable PRE backup, function-specific before/after hashes and full-project read-back; live drift aborts before mutation.
- Runtime Task results remain pending native execution; source deployment alone is not a Task-update claim.

## One-function live deployment — 2026-10-20 16:18 Toronto

- Actions run 39490784704 succeeded. PRE source preserved before mutation in artifact 12296395235; deployment evidence in artifact 12294759583.
- Only tmv3_repairExistingTaskRelationships in live 58_Operations changed. Full project source hash read-back: before 4d49f011e822864b8ca073a8bdfd76d2271726d942212015bb16400378e9a929; after 00ab98af9cbbdf4af61cfb83de539e4fd8e0e3981143c19b304bd650c73aa661. Permissions and all other source were preserved.
- Deployment runner passed 15 isolated safety checks. Relationship regression passed existing 10 repair cases, 8 audit cases and 30 new Service/Delivery safety cases; all eight regression scripts passed in PR 131 CI before deployment.
- New function is deployed, but post-deployment native runtime / Task canary remains PENDING. Deployment itself executed zero Task writes and did not invoke scripts.run.
- Live workbook audit independently confirms native Service worker repairs earlier today: Tasks 19199 (10:52), 19202 (13:52) and 19200 (15:33), ORDER and REQUESTED_BY, readbackVerified=true. These precede deployment and are not acceptance evidence for the new function.
- Task 19198 still has an Order/type compatibility rejection. Delivery schedule/identity blockers remain open. General dates, assignments, Calendar and CREATE gates were not enabled.
- Canonical repository relationship function and its regression now synchronized with deployed patch; other live/repository drift identified earlier remains outside this patch. Do not overwrite the entire live project from repository source.

## OAuth scope diagnosis — 2026-10-20

- Read-only Actions run 39490128947 completed the OAuth diagnostic against live HEAD hash 4d49f011e822864b8ca073a8bdfd76d2271726d942212015bb16400378e9a929.
- Token introspection reports 13 granted scopes but lacks all five explicit live scopes: spreadsheets, calendar, script.external_request, script.scriptapp and script.send_mail (Google auth URL prefix applies to each).
- Token audience matches configured OAuth client. Existing API executable access is MYSELF. Shared standard Cloud project and deployer identity alignment remain unverified; scope remediation alone is not yet proven sufficient.
- Reauthorize the existing same-project client with the live required scopes while retaining the management scopes used for source/deployment access; securely update CLASPRC_JSON. Never commit or paste credentials into issues/chat. Recheck read-only diagnostics, then run only tmv3_servicePolicy as the execution canary before any Task write.
- Diagnostic mode and 10 offline scope cases committed as 97745e78ebb22bdc2e28c7616a258efdefcd4a8e. Exact remote file read-back matched. No Task writes, Apps Script source writes, permission changes or credential replacement occurred.

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
