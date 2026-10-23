# Four-vertical scoped production activation — 2026-10-23

Release: `3.12.0-four-vertical-scoped-activation-r1`.

User authorized continued execution until all four verticals are active. Service requires In Progress; Install and Delivery require Approved. PreInspection retains its dedicated optional-SO lane. Legacy calendar intake, scheduled mapping slots, cache schemas, Stage 7 mutation authority, terminal completed-history treatment and Striven-owned Service creation are preserved.

The new hourly handler rotates Service, Delivery and Install, with a maximum of one verified event transaction per vertical per hour and four candidate checks per cycle. Existing scheduled operation slots also call this bounded worker. Fresh Order/Contact/Location reads validate ownership and order status before Stage 7 mutation. Conflicts and ambiguous identity remain REVIEW. INTENT/UNCERTAIN markers prevent blind replay. Existing PreInspection triggers remain installed. Install reminders are creator-only and suppress uncertain resends.

Validation: 378 passing local cases (185 core, 60 completed history, 86 activation, 27 evidence, 20 reminder). The release repeats these tests against the actual production-source candidate before applying six hash-pinned files. Full source is compiled and read back; source outside those six files is preserved.

Expected source SHA-256: `8c3b2fb3776a2b5d19391f65b7e04ddd68a1d90cc06e66d90daf3c35de34aeef`.

Native activation evidence pending completion of run 40012614518. Do not treat this document alone as proof of successful activation. Existing immutable deployment versions and access permissions are preserved. General AUTO and MANUAL writes remain disabled; dedicated scopes authorize the automatic work.
