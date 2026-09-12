# PreInspection Workflow

## Scope

PreInspection is one of the four primary Task Mapping workflows. This folder contains the detailed PreInspection flow and the PreInspection-specific Requested By policy.

## Current production profile

- Task Type ID 105.
- Default Pool ID 8.
- Preferred concise title: `Preinspect - Customer Name - (###) ###-####`.
- Requested By: exact Google Calendar organizer email → exactly one Striven Employee → `RequestedBy.Type = employee`.
- Calendar notes belong only in Custom Field 854 Install Notes.
- Task Description is blank on create and remains technician-owned.
- Do not prefill technician-completed fields such as Difficulty of the Job, Job Risk, Finishing, Electrical Work, or Custom Metal Work.
- Sales Order is not pushed merely to create/recreate a PreInspection task.

## Customer resolution contract

Calendar evidence may include:

1. Customer Number;
2. exact Sales Order Number;
3. normalized phone;
4. address similarity.

All branches must converge to one verified customer package before automatic mutation. Contradictory or ambiguous evidence requires `REVIEW_REQUIRED`.

## Task resolution

- exactly one valid OPEN PreInspection task → reuse/reconcile;
- zero valid OPEN task → eligible CREATE after guardrails and duplicate recheck;
- multiple valid OPEN tasks → `REVIEW_REQUIRED`.

## Downstream completion/handoff

After the PreInspection task is DONE:

- wait for a unique final Sales Order;
- locate exactly one same-customer Install target using the final SO as the strongest anchor;
- append the completed PreInspection Task link below the Install Task link in the managed Install Calendar block;
- preserve authored Calendar text;
- make the write idempotent;
- read back and verify.

No final SO yet = `DEFERRED_RETRY` rather than terminal skip. Zero Install match = deferred retry. Multiple/mismatched targets = review.

## Current verification status

The R3.4.22 production Requested By router fix is **VERIFIED CURRENT**. Runtime verification on 2026-09-11 confirmed all three existing linked PreInspection tasks used exact organizer→Employee resolution and read back as `RequestedBy.Type=employee`.

Other PreInspection lifecycle elements still contain proof gaps, including final DONE→Install handoff, Field 854 end-to-end proof, new-location creation, missing-Customer-Number organizer notification, and the separate Sales Order Internal Notes handoff.

## Detailed documents

- `FLOW.md` — end-to-end canonical business flow.
- `REQUESTED_BY_POLICY.md` — exact Requested By resolution and runtime evidence.

## Reorganization inventory still required

Before PreInspection source code is moved or consolidated, capture:

- PreInspection files/functions;
- public/menu/trigger entrypoints;
- PreInspect Calendar and PreInspect Task Mapping sheet dependencies;
- customer/location/contact/employee resolution functions;
- task matching/planning/create/reconcile functions;
- Calendar link and DONE-handoff functions;
- Field 854 and technician-owned field handling;
- duplicate prevention and uncertain-write reconciliation;
- spreadsheet-context dependencies;
- compatibility aliases and callers.
