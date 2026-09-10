# PreInspection — Canonical Business Flow

**Status:** agreed target design as of 2026-09-10. This documents the desired business flow; it does not claim every stage is implemented or runtime-verified.

## A. Read Calendar identifiers

From the Google Calendar event, look for one or more of:

1. Customer Number
2. Sales Order Number
3. Customer Phone Number
4. Customer Address

Multiple identifiers should corroborate one another rather than create competing workflows.

## B. Resolve the customer

### Customer Number branch

Use Customer Number to resolve the Striven customer, then retrieve and cross-check Customer ID, name, phone, locations/addresses, and associated contacts.

### Sales Order branch

Use the exact Sales Order Number to resolve its customer, then retrieve the customer's canonical identity, locations, and contacts. The SO is evidence for customer resolution; it is **not** required to be attached to a newly created PreInspection task.

### Phone branch

Normalize the phone, match it against the Contacts dataset, identify the owning customer, then retrieve canonical customer and location details. Multiple unrelated matches require REVIEW.

### Address branch

Normalize the Calendar address, match against customer locations, identify the owning customer, then retrieve canonical customer/contact details. Ambiguous matches require REVIEW.

## C. Convergence package

Every branch must converge to one verified package containing, where available:

- Customer ID
- Customer Number
- Customer Name
- Customer Phone
- Contact ID
- Contact Name
- Contact Phone
- Location ID
- Full Address
- Sales Order ID/Number as evidence/context
- Match Source
- Match Evidence
- Match Status

If no unique customer can be established: **REVIEW; no task mutation.**

If the customer is uniquely verified but the Calendar event itself does not contain the Customer Number: send a **non-blocking, deduplicated email to the event organizer** asking them to add the resolved Customer Number. Continue the task workflow; do not block a valid appointment merely because the Calendar data needs cleanup.

## D. Resolve the PreInspection task

Look for one valid **OPEN PreInspection Task Type 105** for the resolved customer/location/event context.

- exactly one valid OPEN task → reuse it;
- no valid OPEN task → create one clean task;
- multiple valid OPEN tasks → REVIEW.

Do not clone technician-completed field state from a DONE task into a new PreInspection appointment.

## E. Synchronize desired task state

The task should be reconciled to:

- Customer — resolved customer
- Location — resolved customer location
- Requested By — resolved customer contact (`Type: contact`)
- Start Date/Time — Google Calendar
- Due Date/Time — Google Calendar
- Assigned Pool — Pool 8
- Custom Field 854 Install Notes — Calendar-authored notes only
- Task Description — technician-owned; blank on create and not overwritten by Calendar notes
- Technician-completed fields — not prefilled
- Sales Order — not required/pushed merely to create the PreInspection task

Update only fields that differ from the desired state.

## F. Verify and link

Read the task back from Striven and verify the material state. Then maintain one idempotent managed Striven Task link in the PreInspection Calendar description while preserving organizer-authored text.

## G. Technician completion

When the PreInspection Task is DONE, preserve technician-entered results. A final Sales Order may now be attached/identified.

## H. Install Calendar handoff

Once the PreInspection is DONE **and a final Sales Order is attached**:

1. use the exact Sales Order Number as the primary anchor;
2. find the matching Install task/event in the Install workflow;
3. verify the Install task/event belongs to the same customer;
4. require exactly one valid Install match;
5. append the completed PreInspection Task link immediately below the existing Install Task link in the managed Install Calendar description block;
6. preserve authored Calendar text;
7. read the Calendar description back and verify both links;
8. make the operation idempotent so repeated syncs do not duplicate the PreInspection link.

If zero Install matches exist, perform no Calendar write and retry on a later reconciliation. If multiple matches exist, REVIEW rather than guessing.

## I. Final Sales Order handoff

The intended final lifecycle also includes a guarded DONE PreInspection → Sales Order Internal Notes handoff. This remains a separate downstream write and must require unique final-SO resolution plus idempotent/read-back verification before production use.
