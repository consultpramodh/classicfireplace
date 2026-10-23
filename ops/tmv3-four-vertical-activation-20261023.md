# Four-vertical scoped production activation — 2026-10-23

Release: `3.12.0-four-vertical-scoped-activation-r1`.

User authorized continued execution until all four verticals are active. Service requires In Progress; Install and Delivery require Approved. PreInspection retains its dedicated optional-SO lane. Legacy calendar intake, scheduled mapping slots, cache schemas, Stage 7 mutation authority, terminal completed-history treatment and Striven-owned Service creation are preserved.

The new hourly handler rotates Service, Delivery and Install, with a maximum of one verified event transaction per vertical per hour and four candidate checks per cycle. Existing scheduled operation slots also call this bounded worker. Fresh Order/Contact/Location reads validate ownership and order status before Stage 7 mutation. Conflicts and ambiguous identity remain REVIEW. INTENT/UNCERTAIN markers prevent blind replay. Existing PreInspection triggers remain installed. Install reminders are creator-only and suppress uncertain resends.

Validation: 378 passing local cases (185 core, 60 completed history, 86 activation, 27 evidence, 20 reminder). The release repeats these tests against the actual production-source candidate before applying six hash-pinned files. Full source is compiled and read back; source outside those six files is preserved.

Expected source SHA-256: `8c3b2fb3776a2b5d19391f65b7e04ddd68a1d90cc06e66d90daf3c35de34aeef`.

Native activation completed in resumed run 40012950442; see verified outcome below. Existing immutable deployment versions and access permissions are preserved. General AUTO and MANUAL writes remain disabled; dedicated scopes authorize the automatic work.

## Verified production outcome

Release run [40012950442](https://github.com/consultpramodh/classicfireplace/actions/runs/40012950442) succeeded. Independent read-only audit [40013417638](https://github.com/consultpramodh/classicfireplace/actions/runs/40013417638) succeeded. All four scopes enabled; 18 triggers; exactly one new hourly vertical handler; all installed handlers exist; no missing configuration or sheets; source unchanged during independent audit. API count 591, ordinary remaining 409, PreInspection reserve 200; no budget reset.

Service Task 18962: name update and Calendar links verified. Install Task 18745: assignments, Calendar title, Task name and links verified. Delivery first event `0pau8qi27tv3sp9vve5p90ch53@google.com`: existing persisted Task 18704 blocked CREATE, no duplicate created; event marked for reconciliation and no blind retry. Delivery automation is active but this record is held; no Delivery live mutation convergence is claimed. PreInspection remains active with its previously documented Goldcon/SO583967 identity exception.

Two verified event transactions occurred. Original release runner top-level businessWrites erroneously stayed zero; corrected durable evidence includes native results and explicit reporting correction. All-four activation is verified; full successful live mutation coverage across all four is not claimed. Overview value-only status cells updated and read back. Existing immutable deployments and permissions unchanged.
