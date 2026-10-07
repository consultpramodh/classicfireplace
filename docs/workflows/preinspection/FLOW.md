# PreInspection — Canonical Business Flow

**Status:** current operating contract as of 2026-10-06.

## A. Authoritative Calendar intake

The **CF Preinspects** calendar is the single authoritative PreInspection source.

- Stephen's Calendar is mirror-only for intake and does not create an independent Task Mapping record.
- CF Preinspects remains the sole authoritative intake source.
- Both CF Preinspects and Stephen's Calendar must converge to the same canonical presentation state after a verified write.
- Every CF Preinspects event must include `stephen@classicfireplace.ca` as a required guest.
- Canonical Calendar title on both copies: `<Customer Number> - <Customer Name> - <Phone>`.
- Calendar description on both copies contains the same human-authored notes plus exactly one managed `-----Striven Links-----` block.
- Use the established Monic OLIVER Calendar source pattern for managed links: `[label](URL)`. Google Calendar must render the Sales Orders and Task labels as clickable links; do not emit literal HTML tags or `<br>` formatting.
- Do not copy an old Calendar title into the description.

From the CF Preinspects event, retain Customer Number, phone, address/location, optional Sales Order evidence, event date/time, and organizer/creator email.

The organizer/creator email is the authoritative source for PreInspection Requested By.

## B. Resolve the Customer

Evidence may include:

1. Customer Number;
2. exact Sales Order Number;
3. normalized phone;
4. Customer-owned address/location;
5. existing verified Task evidence when available.

All evidence must converge to one deterministic Customer. Ambiguity or conflicting evidence requires REVIEW.

A Sales Order may corroborate Customer identity, but it is **not required to create a PreInspection Task and is not attached at CREATE**.

## C. Resolve the Location

Resolve the Calendar job-site address against Locations owned by the verified Customer.

- exactly one owned Location match → use it;
- no owned Location but identity/address is deterministic → `CREATE_LOCATION` before Task CREATE;
- multiple plausible owned Locations → REVIEW;
- Location belonging to another Customer → REVIEW.

No PreInspection Task may be created against an unverified Customer/Location relationship.

## D. Resolve OPEN PreInspection Tasks — Stage 5

Resolve Task Type **105 — Pre Inspection** from the shared Task cache.

- exactly one valid OPEN Task for the verified appointment context → MATCH and reuse;
- multiple valid OPEN Tasks → REVIEW;
- zero OPEN Tasks → preserve all applicable historical Task evidence and pass to Stage 6;
- Calendar contains a Task link missing from the cache and no safe cached replacement can be proven → REVIEW / fail closed.

Routine Stage 5 must not interpret an incomplete cache as permission to create a replacement Task.

## E. Decide CREATE / RECREATE / FULFILLED — Stage 6

**NO OPEN TASK does not automatically mean CREATE.**

For a Stage-5 `NO_TASK` result, apply this decision order:

1. **No applicable historical Task** → `CREATE_TASK`.
2. **Completed/fulfilled Task on the same Calendar event day** → `FULFILLED_NO_RECREATE`.
3. **Cancelled Task on the same event day** → REVIEW.
4. **Historical Task exists but its appointment date cannot be proven** → REVIEW.
5. **Historical Task is dated after the Calendar event** → REVIEW.
6. **Only older historical Task evidence remains** → `RECREATE_TASK`.

This history gate is mandatory duplicate prevention. Do not skip it.

## F. Desired Task state

When an OPEN Task is reused or a CREATE/RECREATE is authorized, the desired PreInspection state is:

- Task Type — **105 — Pre Inspection**
- Task name — `<Customer Name> - <Street, City> - <Phone>`
- Customer — verified Customer
- Location — verified Customer-owned Location
- Requested By — exact Calendar organizer/creator → Striven Employee (`Type: employee`)
- Start/Due — CF Preinspects date/time
- Assigned Pool — **Pool 8 — Pre-Inspection Pool**
- Task Description — **blank on CREATE**; technician-owned afterward
- Field 854 — **not managed by Task Mapping**
- InfoCustomFields at CREATE — none
- technician-completed assessment fields — not prefilled
- Sales Order — not required and not attached merely to CREATE/RECREATE

The Customer Contact is contextual evidence only and is not PreInspection Requested By.

If the organizer email cannot resolve uniquely to a Striven Employee: REVIEW. Do not fall back to a Customer Contact.

## G. Consequential-write gate — Stage 7

Before any CREATE/RECREATE or material Task mutation:

1. reread the authoritative CF Preinspects event;
2. verify the event fingerprint has not materially changed;
3. verify Customer and Location ownership;
4. freshly recheck duplicate/open/historical Task evidence required for the action;
5. verify Requested By and assignment evidence;
6. fail closed on ambiguous or stale linked-Task evidence;
7. perform only the approved mutation;
8. read the written Task back from Striven.

Never blindly retry an uncertain Task CREATE. Reconcile first.

## H. Calendar completion

After Task read-back succeeds:

- preserve human-authored notes;
- maintain exactly one `-----Striven Links-----` block on both configured PreInspection Calendar copies;
- include the Customer Sales Orders link as a clickable hyperlink;
- include one verified Task link as a clickable hyperlink when a deterministic Task exists;
- normalize the canonical Calendar title on both copies;
- ensure Stephen remains a required guest;
- read both Calendar copies back and verify the same managed presentation state.

## I. Technician completion and Install handoff

When the PreInspection Task is DONE:

- preserve technician-entered results;
- resolve a unique final Sales Order only where needed for the downstream Install handoff;
- locate exactly one same-customer Install target;
- append the completed PreInspection Task link to the managed Install Calendar block;
- make the operation idempotent and read-back verified.

No final SO yet or no Install match yet → `DEFERRED_RETRY`. Multiple/mismatched targets → REVIEW.

## J. Final Sales Order handoff

Any DONE PreInspection → Sales Order Internal Notes write remains a separate guarded downstream mutation and requires unique final-SO resolution plus idempotent/read-back verification.
