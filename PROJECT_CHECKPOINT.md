# Task Mapping — Latest Checkpoint

**Checkpoint date:** 2026-10-07 (America/Toronto)

## Canonical branch

`task_mapping` is the single canonical Task Mapping branch.

## Active rewrite

- System: **Task Mapping V3**
- Source: `apps-script/tmv3-clean/`
- V3 version: `3.11.69-preinspection-calendar-parity-r2`
- Hard-rule version: `2026-10-07-r7`
- Execution stage: `7`
- Bound Script ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- Spreadsheet ID: `1Rxo2t3QjlC7TFWNc3kQ8A2foBAxM0l0VcEtRh4fkU2E`
- Mode: `SHADOW_READ_ONLY`
- Automation business writes: **disabled**

## Canonical decision source

Read `CURRENT_DECISION_REGISTER.md` before changing Task Mapping. It contains the latest explicit business decisions and supersedes older chat-derived rules when marked superseded.

## PreInspection frozen rules

- CF Preinspects is authoritative; Stephen's Calendar is mirror-only and Stephen remains a required guest.
- Calendar title: `<Customer Number> - <Customer Name> - <Phone>`.
- Task name: `<Customer Name> - <Street, City> - <Phone>`.
- Task Type 105.
- Pool 8.
- Requested By = exact Calendar creator/organizer resolved to Striven Employee.
- Sales Order is not required/attached merely for CREATE/RECREATE.
- Customer-owned Location is mandatory; safe missing Location may be created before Task CREATE.
- Task Description is exactly blank at CREATE and technician-owned afterward.
- **Field 854 is not managed by Task Mapping.**
- Calendar notes remain on Calendar only.
- No InfoCustomFields at CREATE.
- Technician-completed assessment fields are not prefilled.
- When a PreInspection Calendar title is normalized, preserve the exact previous title as the first line of Description with no extra heading. Remove presentation-only `Notes:` / `Sales Order:` labels while preserving the actual content and legitimate inline SO values.
- Managed Calendar description preserves authored notes and contains exactly one Striven Links block with clickable Google Calendar hyperlinks. Existing correct clickable blocks are preserved exactly; raw `[label](URL)` text is invalid.
- Every required physical PreInspection Calendar copy must match the authoritative CF Preinspects event for **full business-visible parity**: title, Description, location, start/end, required Stephen participation, and managed links. Only unavoidable Google system metadata may differ.

## Service ownership boundary

- ServiceOps ends at certified Service Work Order.
- Striven's Work Order workflow owns Service Task creation/recreation.
- Task Mapping only discovers/reconciles the Striven-created Service Task(s).
- Missing Service Task is a blocker/wait-for-Striven condition, never permission for Task Mapping to create a substitute.
- Multi-fireplace FP#n sibling tasks remain valid and are reconciled as an event-level set.

## Safety / verification

- Never guess identity or ownership.
- Never blindly retry uncertain CREATE.
- Consequential writes require fresh ownership checks and authoritative read-back.
- Step 7 is the sole mutation authority.
- Calendar writes are limited to explicitly approved managed fields/actions.
- No Step 8/9/10 Apps Script files.

## Latest deployment evidence

- Guarded deployment run: `37679724316` — **SUCCESS** for `3.11.69-preinspection-calendar-parity-r2`.
- Live hardening regression: `37679868267` — **SUCCESS**.
- Regression proves prior-title preservation, Notes:/Sales Order: header removal with content preservation, required-copy targeting, full business-state parity comparison, Field 854 no-management, and Service Task creation ownership.

- Source/deployment commit: `20727ce1c1e9a332ae2f36b02c03e264d5c6ca66`.
- Guarded bootstrap run: `37672082690` — **SUCCESS**.
- Existing bound Apps Script project updated successfully.
- Remote re-clone/file/hash parity verification completed successfully.

## Next exact verification work

1. Keep `SHADOW_READ_ONLY`.
2. Continue controlled live PreInspection reconciliation/canaries against today's real events.
3. Run the controlled PreInspection Location-create canary when a genuinely missing Customer-owned Location case is intentionally selected. Field 854 is never a completion gate.
