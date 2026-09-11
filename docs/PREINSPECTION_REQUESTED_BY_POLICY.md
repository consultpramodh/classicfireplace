# PreInspection — Requested By Policy

**Approved:** 2026-09-11

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

## Verification evidence before this change

Historical PreInspection runtime logs show the prior behavior resolved Requested By from customer contacts, with resolution methods such as `CUSTOMER_CONTACT_PHONE` and `MAPPING_CONTACT_ID_VERIFIED_ON_CUSTOMER`. This policy intentionally supersedes that behavior for PreInspection only.

## Deployment status

**APPROVED REQUIREMENT / PRODUCTION PATCH PENDING LIVE-SOURCE DEPLOYMENT.**

Do not claim this rule is live until the exact current Apps Script source is pulled, the PreInspection-only patch is applied, pushed to the bound Apps Script project, remotely read back, and runtime-tested on at least one organizer that resolves to a Striven Employee.
