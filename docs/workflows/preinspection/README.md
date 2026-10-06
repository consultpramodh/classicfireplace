# PreInspection Workflow

## Scope

PreInspection is one of the four primary Task Mapping workflows. **CF Preinspects is the authoritative Calendar source.** Stephen's Calendar is mirror-only; every CF Preinspects event must include `stephen@classicfireplace.ca` as a required guest.

## Current production profile

- Task Type ID **105 — Pre Inspection**.
- Default assignment: **Pool 8 — Pre-Inspection Pool**.
- Canonical Calendar title: `<Customer Number> - <Customer Name> - <Phone>`.
- Canonical Task name: `<Customer Name> - <Street, City> - <Phone>`.
- Requested By: exact Google Calendar organizer/creator email → exactly one Striven Employee → `RequestedBy.Type = employee`.
- Sales Order is optional identity/context evidence and is **not required or attached merely to CREATE/RECREATE** a PreInspection Task.
- Calendar notes remain **Calendar-only**.
- **Field 854 is not managed by Task Mapping.**
- Task Description is exactly blank on CREATE and remains technician-owned.
- Do not prefill technician-completed fields such as Difficulty of the Job, Job Risk, Finishing, Electrical Work, or Custom Metal Work.
- Calendar description = authored notes + exactly one managed `-----Striven Links-----` block. Do not copy the previous Calendar title into the description.

## Customer and Location resolution contract

Calendar evidence may include Customer Number, Sales Order Number, normalized phone, and address. All evidence must converge to one verified Customer and Customer-owned Location before automatic mutation.

- unique verified Customer + existing owned Location → continue;
- unique verified Customer + genuinely missing job-site Location → `CREATE_LOCATION` before Task CREATE;
- contradictory or ambiguous identity → REVIEW;
- Contact ambiguity is not authoritative for PreInspection Requested By.

## Task resolution and no-open-task policy

Stage 5 resolves the current Type-105 Task set. Stage 6 owns the final create/recreate decision.

- exactly one valid OPEN PreInspection Task → reuse/reconcile;
- multiple valid OPEN Tasks → REVIEW;
- zero OPEN Tasks does **not** automatically mean CREATE:
  - no applicable historical Task → `CREATE_TASK`;
  - completed/fulfilled Task on the same Calendar event day → `FULFILLED_NO_RECREATE`;
  - cancelled Task on the event day → REVIEW;
  - historical Task with an unproven date → REVIEW;
  - history dated after the Calendar event → REVIEW;
  - only older historical Task evidence → `RECREATE_TASK`;
  - persisted Calendar Task link missing from cache with no safe fallback → REVIEW / fail closed.

Before any CREATE/RECREATE write, Stage 7 must fresh-verify the Calendar event, Customer/Location ownership, duplicate Task state, and any other relationship needed for the write. Never create a replacement merely because routine cache evidence is incomplete.

## Calendar completion

After a Task is verified, maintain one idempotent managed Striven link block on the authoritative CF Preinspects event:

- Customer Sales Orders link;
- one Task link when a deterministic Task exists.

Stephen remains a guest on the primary event. Do not create an independent Stephen-calendar business record.

## Downstream completion/handoff

After the PreInspection Task is DONE:

- preserve technician-entered results;
- wait for a unique final Sales Order where the downstream Install handoff requires one;
- identify exactly one same-customer Install target;
- add the completed PreInspection Task link to the managed Install Calendar block idempotently;
- read back and verify.

No final SO yet = `DEFERRED_RETRY`. Zero Install match = deferred retry. Multiple/mismatched targets = REVIEW.

## Detailed documents

- `FLOW.md` — end-to-end canonical business flow.
- `REQUESTED_BY_POLICY.md` — exact Requested By resolution and runtime evidence.
