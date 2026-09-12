# PreInspection — Requested By Policy

**Approved:** 2026-09-11  
**Current production status:** LIVE / runtime-verified in R3.4.22.

## Scope

This rule applies **only to PreInspection tasks (Task Type 105)**. Install, Delivery, and Service Requested By behavior must remain unchanged.

## Authoritative rule

PreInspection `Requested By` is the **Google Calendar event organizer**, representing the sales rep who owns/created the appointment.

The customer contact remains part of customer/contact resolution where useful, but it is **not** the PreInspection Requested By.

## Resolution

1. Read the organizer email from the PreInspection Google Calendar event / mirrored `Organizers` field.
2. Normalize the email (trim + lowercase).
3. Resolve the email to exactly one Striven Employee.
4. Write the task payload as:

```text
RequestedBy = { Id: <Employee ID>, Type: 'employee' }
```

5. Read the task back and verify the Requested By employee ID.

## Fail-closed rules

- organizer missing → REVIEW; no Requested By write;
- no Striven Employee matching organizer email → REVIEW; no fallback to customer contact;
- multiple employee matches → REVIEW; do not guess;
- do not hard-code employee IDs when an exact organizer-email lookup is available;
- cache/reuse the Employee directory within a reasonable freshness window so this rule does not create unnecessary API traffic.

## Creation and reconciliation

- New PreInspection task: do not seed Requested By from the customer Contact ID. Resolve the organizer employee instead; if unresolved, leave Requested By unset and REVIEW rather than writing the wrong person.
- Existing OPEN PreInspection task: if Requested By does not match the resolved organizer employee, patch only Requested By and read back verify.
- Customer, Location, dates, Pool 8, Field 854, technician-owned fields, and no-SO-at-create rules are unchanged.

## Historical behavior superseded

Historical PreInspection runtime logs showed the former behavior resolving Requested By from customer contacts, with methods such as `CUSTOMER_CONTACT_PHONE` and `MAPPING_CONTACT_ID_VERIFIED_ON_CUSTOMER`. This policy supersedes that behavior for PreInspection only.

## Production verification

R3.4.22 repaired the production R30 Requested By router so it delegates to the organizer→Employee plan. Runtime verification on 2026-09-11 confirmed all three existing linked PreInspection tasks used exact Calendar-organizer Employee resolution and read back with `RequestedBy.Type=employee`:

- Task 18379 → Employee 20
- Task 18241 → Employee 54
- Task 18362 → Employee 31

The final read-only audit recorded **3 PASS / 0 FAIL / 0 REVIEW** for the linked tasks.

A later normal scheduled-batch audit is still retained as a separate scheduler-regression proof item; it does not change the current live Requested By rule.
