## Full Open Task import and Sheet refresh — 2026-10-21

- User requested current Sheet data and all Open Tasks for patching, highlighting Service Task18983 / Samuels / SO585765. Official Striven swagger/v1/swagger.json documents /v2/tasks/search, TaskSearchParams.Status integer array and maximum PageSize1000. Derive the Open status ID from fresh Task18983; do not hard-code it.
- Native full search completed2026-10-21T14:57:23.469Z:1600 Open Tasks,438 previously absent records added, Source Tasks4765 ->5203 rows. Search identity DTOs do NOT contain Order/RequestedBy/Location/schedule fields; merges preserve existing values for omitted properties. Backup Source Tasks PRE 20261021 retained hidden. Independent Sheet read reconciled5203 unique Task IDs.
- Current Open search type totals include250 Service Tasks and36 BBQ/Fireplace Delivery Tasks; other Open task types were also imported. Source Tasks still has1602 cached Open statuses: two apparent stale Service candidates18920/19182 require fresh Task GET; do not claim every historical status has been refreshed. These IDs were added to the targeted recovery reads.
- Fresh Task18983 GET proved Customer46902, Location41517, Requested By41127 Type contact, Order27499. Canonical v1 schedule Oct26 11:00–13:00 Toronto. These relationships were already present on Striven; missing Sheet values were a cache/display problem. Service F38:G38 updated from verified data and independently read back; original Customer/Task hyperlinks and wrapping preserved. No new Task18983 mutation is confirmed.
- Run39620929503 job119293776007 imported all records and hydrated36 of72 initially selected detail records. It stopped on a non-JSON HTML web response; exact live source restoration/hash0881de3a4e112c7e2830785ba6464edb1af494c874ad08dee6c769a95ae2e74b was verified. Last recorded budget1102/1200,98 remaining. Later native outcomes remain UNKNOWN until fresh audit/properties reconciliation.
- Recovery trigger commit7b1d7159a1d1915d18c906c04ed9ab6d3a913d79 adds fresh reads for18920/19182 and resumes saved progress. Subsequent code commits preserve rich-text links when replacing obsolete optional-contact wording; that improvement is committed but not claimed runtime-accepted. Run-level rerun requests were refused by GitHub with workflow already running, despite failed-job logs; do not blindly replay mutations or treat this403 as OAuth-scope proof.
- All Open identities are imported; remaining detailed verification/operator-view rebuild and all-Task field repairs are NOT complete. No permanent Apps Script source or routine automation change is claimed by this one-time refresh. Existing daily API brake remains intact.
- Executed9 import/paging/budget/no-destructive-merge checks,1 rich-text hyperlink-span test and11 expiring-auth/launch checks, all PASS. Source artifacts tools/tmv3-open-tasks-refresh-native.js and tools/test-tmv3-open-tasks-refresh.js are committed. Browser policy restrictions were not bypassed.

## Requested By backlog complete — 2026-10-21 10:25 Toronto

- Final native state REQUESTED_BY_COMPLETE:64 new Contact-only patches (50 Service,14 Delivery),7 existing Requested By values preserved,10 held; zero pending and zero uncertain outcomes. Reconciled all81 unique fixed target IDs across three job logs;64 result rows have writes=1 and readbackVerified=true in original native logs.
- Recovery run39613672208 attempt2 job119278112794 succeeded. Four lock-busy slices performed no Task writes, followed by the five final Service patches19280–19284. Independent sparse writer checks and fresh Task readback were required for each patch.
- Held IDs18735,18754,18774,18806,18831,18896,18913,19198,19260 have no existing Order link;19262 fails fresh Task identity/status/Customer eligibility. Existing employee Requested By19 on19064 was preserved, not represented as a verified Customer Contact.
- Final source restoration/readback hash0881de3a4e112c7e2830785ba6464edb1af494c874ad08dee6c769a95ae2e74b, headRestoredVerified=true and sourceParityVerified=true. No versions/deployments/OAuth scopes changed. API budget1052/1200,148 remaining at completion.
- GitHub API/Actions and Google API execution work. Browser recheck was rejected by automatic approval review for the policy-restricted GitHub origin; do not bypass. Browser access is not required for this completed repair.
- Machine-readable per-Task evidence:ops/tmv3-service-delivery-requested-by-results-20261021.json. The report cache may omit Contact IDs; it is not the authoritative source for a missing live Requested By. No permanent source/automation change is claimed by this one-time backlog repair.

## Connection checks and Requested By execution — 2026-10-21

- This supersedes the earlier prepared-only runtime assessment. Delayed Actions evidence now proves execution. GitHub repository reads/writes work; Google Sheets metadata read succeeds; Apps Script OAuth refresh/source capture and native Striven execution succeeded. No credential reset is indicated by the inspected evidence.
- Browser GitHub navigation fails with Host access is restricted by policy. Do not bypass that restriction or treat it as a Google OAuth failure. The authorized GitHub Actions path remains usable.
- Runs39612306476 and39613672208 produced59 Contact-only PATCH results, all readbackVerified=true:45 Service and14 Delivery. Seven existing Requested By values were preserved (including Task19064 employee19); ten Tasks held (nine have no existing Order link,19262 fails fresh Task identity/status/Customer eligibility). Five targets remain pending:19280,19281,19282,19283,19284. Do not claim all81 complete.
- Last successful slice budget987/1200,213 remaining. Last two HTTP response failures: HTTP500 and non-JSON HTML. Both runs verified exact source restoration/full hash0881de3a4e112c7e2830785ba6464edb1af494c874ad08dee6c769a95ae2e74b. Transport failure alone is not proof of credential expiration.
- Authorized restart of job119268877579 accepted; run39613672208 attempt2 job119278112794 is currently queued. Native durable INTENT reconciliation must run before any uncertain Task mutation can be retried; existing completed outcomes are skipped.
- Next: inspect restart final native tally and all five remaining results; preserve evidence and final source-parity proof. No permanent automation change or universal connection repair is claimed.

## Requested By repair prepared — 2026-10-21

- User reports Requested By still blank after the Order-only bulk backfill. No new live Contact write is verified in this session.
- Contact-only repair committed in ca34ad9841e2d200a1609075a9b5127f2c18b4df; fixed original81 Tasks. Fresh open Task identity, existing Order link, active Order number/Customer proof and fresh Contact ownership are required. Existing Requested By values are preserved. Sparse payload is restricted before mutation to Id/RequestedBy; independent writer and fresh readback verify the result. Durable INTENT prevents blind retries.
- Executed14 focused Contact tests and11 existing temporary authentication tests, all PASS. Runtime acceptance remains PENDING.
- Workflow .github/workflows/tmv3-sd-requested-by.yml captures durable PRE before temporary HEAD execution, restores exact source after each bounded slice, and preserves per-slice results. Full source must match0881de3a4e112c7e2830785ba6464edb1af494c874ad08dee6c769a95ae2e74b or halt without write. No permanent automation changes have been deployed.
- GitHub accepted commits ca34ad9,7857fcb,7ce1014, but repeated Actions queries show zero runs for them. Cause UNKNOWN. Direct shell push failed because HTTPS credentials are unavailable. Available GitHub connector has no workflow-dispatch operation. Do not claim execution or replay older Order/cache workflows as a Contact repair.
- Next: start the prepared Requested By workflow on task_mapping through an authorized GitHub execution path, inspect native outcomes/source restoration, then reconcile results before claiming success.

## Bulk Order-link backfill completed — 2026-10-20

- All81 captured targets processed; zero pending and zero uncertain writes. Final outcomes: **68 new Order links patched and freshly read-back verified,2 existing links confirmed,11 still unlinked and held**.
- Service55:50 patched,1 already linked (19098),4 held (19064,19198,19260,19262). Delivery26:18 patched,1 already linked (18979),7 held (18735,18754,18774,18806,18831,18896,18913).
- Held causes:9 Order-active checks failed;19064 has no SO# title;19262 is currently Canceled, confirmed by fresh Task GET. No Order/Task lifecycle changes were made.
- Native final audit17:55:03 reports69 VERIFIED/12 BLOCKED. This is consistent with the link outcomes:19098 was held from new writes on lifecycle grounds but already has Order27661, confirmed in the later cache-only read. There were68 unique ORDER-only PATCH audit records, each readbackVerified=true.
- Current deployed source hash0881de3a4e112c7e2830785ba6464edb1af494c874ad08dee6c769a95ae2e74b. Guarded source deployment39501646932 succeeded. Source parity and canonical HEAD restoration were again verified after cache cleanup39505037029; no versions/deployments created.
- Final independent Sheet reconciliation found each of81 target IDs exactly once and no disagreement for any of68 new Order IDs. Cache discrepancies (omitted links, duplicate19281 and displaced historical16025 row) were restored from fresh API reads with a private pre-repair backup and zero Striven writes.19262 was reintroduced in cache with its true Canceled status. The underlying cause of these cache discrepancies remains UNKNOWN; do not claim a permanent upstream cache-sync fix.
- API budget after cache cleanup:897/1200 V3 calls,303 remaining. This is the shared V3 daily counter, not an isolated backfill-call total.
- Executed focused checks:36 backfill cases,14 cache-only cases,11 expiring-auth cases,37 deployment checks; existing relationship/status/production-lane and43 details cases passed. Scope stayed Order-only for these writes.
- Final machine-readable record:ops/tmv3-service-delivery-order-backfill-results-20261020.json. Routine automation retains its existing policy; the accelerated fixed queue is complete and its continuation was removed at the final native slice.

## Fixed 81-Task Order backfill running — 2026-10-20 17:20 Toronto

- User explicitly authorized bulk processing of all 55 Service and 26 Delivery open Tasks with blank cached Order IDs. The ordinary one-candidate/hour limit is bypassed only for this fixed, durable queue.
- Canonical code commit: 3a875057bb94e3763b0453c41f071c5942cd7ee3. Guarded deployment 39498989016 succeeded; full live source hash ba07493d564dbea536131b1acd43dab8b09bf3b8298c205f4bcc417162fd2765 matches read-back. Live PreInspection helpers and all source outside the worker region were preserved.
- Immediate native launch succeeded through the existing authenticated HEAD deployment in run 39498234649. No versions or deployments were created; expiring token-gated temporary doPost and manifest were removed, canonical source restored and SHA verified. Earlier immutable-version launch failed HTTP429 before execution; source restoration was verified. Do not retry version creation against the known 200-version inventory.
- Native audit now independently shows 10 Order-only patches verified across three slices (17:12,17:14,17:18 summaries); remaining outcomes are pending, not claimed successful. Original cache holds are automatically re-enrolled after the targeted-search correction.
- Fixed queue: at most 8 candidates / approximately 56 calls /120 seconds per slice, automatic continuation after at least60 seconds, prequeued timeout recovery, existing daily API brake retained. Per-Task INTENT, exact fresh Order read-back, no blind retry after uncertain mutation. Source cache omissions never count as proof of a missing live relationship.
- Direct lookup schema was retrieved from official https://api.striven.com/swagger/v1/swagger.json in Actions 39498743786: POST /v1/sales-orders/search, Number/CustomerId/PageIndex/PageSize; Data/TotalCount and Id/Number/Customer responses. Require complete results, exact number and Customer, a unique ID, then authoritative GET ownership/current active status.
- Linking an existing Delivery Task does not require a DELIVERY_APPROVED cache row; SALES_ORDER identity is also accepted for this Order-link lane. Calendar/full-details planning keeps its original gates.
- Tests: all source compiles;32 real batch cases,43 existing details cases,37 deployment checks, relationship/status/production-lane suites pass. One Task19064 has no SO# title and is held. Current runtime verified counts must be refreshed before reporting final completion.
- Queue IDs and contract: release-candidates/tmv3-service-delivery-order-backfill-20261020.json and ops/tmv3-service-delivery-order-backfill-20261020.md.

# CF Tasks — V3 ACTIVE — Clean Rebuild

Checkpoint update: 2026-10-20 (America/Toronto).

## Native automatic SO-title linkage and Task details deployed — 2026-10-20 16:57 Toronto

- No operator editor/menu run is required for routine patches. Existing native scheduled/hourly handlers invoke the shared worker. Missing Order links are resolved from the unique SO# in the fresh existing Service/Delivery Task title, independently of Calendar. Title is not Customer proof; fresh Order ID/number/current active status and Task Customer ownership remain mandatory.
- Native runtime evidence observed at 16:52:12, before this wider release: Delivery Task 19206 automatically patched ORDER and REQUESTED_BY, readbackVerified=true. Independent current Source Tasks read shows Task 19206, SO 586073 / ID 27807, Customer 62933, Requested By Contact 56837, Location 58552. Location was pre-existing and remains unverified against an expected job Location in that transaction; no dates were invented.
- Wider deployment 39495904017 succeeded at 16:54 with durable PRE artifact 12298275540 and result artifact 12297587688. Source hash a001f164f3d750bf4c4212f4b120140c2cde0d07a943d5d4c59bf9e26ad7741e -> db507f4968c468011bf8f55076683c6bdf748f5ad100faf81de3956fa2b63881 matched full read-back.
- Queue/lifecycle follow-up 39496375101 applied and source read-back verified at 16:57:43. PRE artifact 12297083325; result artifact 12296904269. Current full source hash 9d5fb6a3576fbf80ba81d9fd2d9cc7bc7d44f2fc8047b00679fe0d6f7997c30d. Only worker changed in follow-up; other six guarded regions were idempotent.
- Closed/missing/ambiguous cached Order candidates cannot starve Calendar-backed details. Cancellation is checked dynamically rather than a permanent SO-number blacklist, allowing a genuinely reactivated Order to become eligible after fresh proof. Do not automatically cancel Task 19198 or invent a replacement SO.
- Calendar-backed existing Task detail writes are restricted to Location, Order, Requested By, dates and intended assignments under an ephemeral exact-contract context. General flags remain false. Manual employees, notes, names and unrelated fields are preserved; Pool 4 removal requires independent employee read-back. No Calendar edits or Task/Location creation.
- Validation: all eight prior regression scripts passed locally; focused workflow tests passed before both deployments. Current dedicated tests cover 43 automation/ownership/title/scope/read-back cases, 37 scoped deployment cases, 27 Order-status cases, report deduplication and changed/ambiguous fresh titles. GitHub source read-back matches.
- Full-field native runtime acceptance remains PENDING; observed 19206 runtime proves the inherited autonomous relationship path, not the new date/assignment path. One shared candidate/hour limit is preserved. Uncertain writes are held and automatically re-read before completion can be claimed.

## Native automatic Task details — prepared 2026-10-20

- Operator confirms Tasks are created by Striven after the SO moves to In Progress. Task Mapping must automatically attach the Order named by the unique SO# marker in an existing Service/Delivery Task title, without requiring a Calendar appointment or a manual run.
- Missing Order links take priority over Calendar-backed details. The exact fresh Task title must still agree with the cached title; same-ID report duplicates are deduplicated; distinct/multiple SO references and existing relationship conflicts remain review. Fresh Order number, Customer ownership and active status are mandatory because an Order can be canceled after Task creation.
- Existing native worker/trigger path also gains context-restricted Location/Requested By/date/assignment reconciliation from fresh Step 7 Calendar contracts. No Task/Location creation, Calendar edits, note edits or title edits are permitted through this scope. Manual employees remain; Pool 4 removal requires successful intended-employee read-back. One shared existing candidate/hour budget is retained.
- Durable intent markers park uncertain writes; subsequent automatic read-only reconciliation may prove completion but must not blindly retry partial writes. General manual/automation flags and PreInspection permissions remain unchanged.
- Tests executed locally: all Apps Script syntax and all eight existing regression scripts PASS, 41 autonomous detail/scope/title cases, 37 scoped deployment cases, 27 fresh Order-status cases, and added fresh-title/duplicate-report cases PASS. Deployment workflow reruns focused tests before any source write.
- Exact last live source reconstructed and hash-verified as a001f164f3d750bf4c4212f4b120140c2cde0d07a943d5d4c59bf9e26ad7741e. Planned hash db507f4968c468011bf8f55076683c6bdf748f5ad100faf81de3956fa2b63881. Seven guarded function regions only; unrelated live PreInspection helpers preserved.
- This section records prepared code, not a completed deployment or new live Task writes. Native runtime acceptance remains pending.

## Active-Order guard deployed — 2026-10-20 16:40 Toronto

- First guarded attempt 39493651209 stopped before source mutation because the repository baseline omitted appended live PreInspection helpers. Inspected durable PRE artifact 12296395235: worker matched; drift was unrelated appended 58_Operations functions. Scoped boundary reconciled without removing those helpers.
- Retry 39493925963 succeeded. PRE artifact 12296078379 preserved before write; result artifact 12296896732. Entire project source hash changed from 00ab98af9cbbdf4af61cfb83de539e4fd8e0e3981143c19b304bd650c73aa661 to a001f164f3d750bf4c4212f4b120140c2cde0d07a943d5d4c59bf9e26ad7741e and matched read-back exactly. Changed only reviewed relationship writer/Order ownership proof and native worker functions; unrelated live source and permissions preserved.
- Validated all Apps Script syntax, eight existing regression scripts, 15 generic deployment checks, 14 scoped active-Order patch checks, 25 fresh-status cases and both-vertical inactive-order no-write cases. Focused tests reran successfully in deployment workflow.
- Source Orders cache shows 27792 / 586058 (Task 19201), 27789 / 586055 (Task 19203), and 27824 / 586090 (Task 19218) as In Progress. These are candidates, not fresh ownership verification. Delivery cached statuses are blank and require fresh API status proof.
- No new Task write has been confirmed in this session. Source deployment did not execute Tasks. Existing native one-candidate/60-minute worker remains the authorized execution path; post-deployment runtime acceptance is pending.

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
