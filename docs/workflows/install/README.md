# Install Workflow

## Scope

Install is one of the four primary Task Mapping workflows. This document defines the Install business contract that repository/source reorganization must preserve.

**Evidence status:** PROJECT CONTRACT. Exact current 36-file source confirmation is still required before physical source movement.

## Primary identity and matching

- Exact Sales Order evidence is the strongest normal anchor.
- Customer-only matching does not independently authorize automatic mutation.
- Multiple plausible Install task matches require `REVIEW_REQUIRED`.
- When duplicate historical tasks share an SO, prefer only the safest valid OPEN Install task under the current matching rules.

## Normal synchronization

A normal Install PATCH requires:

- a Task ID;
- Task Status = OPEN;
- mapping/write intent eligible under the existing Install workflow;
- complete authoritative Calendar timing for date changes;
- actual expected-vs-current difference before write;
- authoritative relationship values for any customer/location/requested-by change.

If the external state already matches the desired state, use `NO_CHANGE_VERIFIED` after sufficient confirmation rather than generating an unnecessary write.

## Relationship integrity

Before mutation, prove all relationships needed by the plan:

- Sales Order belongs to the intended Customer;
- Location belongs to that Customer;
- Requested By/contact relationship is valid when Install uses it;
- Task belongs to the intended Install workflow/customer/location/context.

Presence of IDs alone is not sufficient.

## Recovery / completed-task replacement

CREATE/RECREATE requires:

- current Calendar appointment still exists and remains in scope;
- authoritative SO Number and SalesOrderId;
- resolved CustomerId;
- resolved LocationId belonging to that customer;
- valid Requested By/contact relationship if used;
- no qualifying OPEN Install task at execution time;
- legitimate completed source task when RECREATE is selected;
- duplicate prevention immediately before CREATE/RECREATE;
- future/past date policy satisfied.

A completed-today case that intentionally waits until later is `DEFERRED_RETRY`, not a terminal skip.

## Calendar link contract

- Exact Event ID ↔ Install Task ID relationship required.
- Maintain one idempotent managed Install Task link.
- Preserve organizer-authored Calendar text.
- Calendar link repair may be allowed for a completed task when the event/task relationship is exact; OPEN status is not automatically required merely to repair a link.
- Read Calendar description back after a material link write.

## Lifecycle endpoint

A normal future appointment is `VERIFIED_COMPLETE` only when the intended OPEN Install task state and required Calendar link are both verified.

Future appointments tied only to an old completed task belong to the recovery path.

## Known reorganization risks to preserve/test

- completed-task recovery must validate cross-entity ownership before CREATE/RECREATE;
- Calendar-link repair must not be incorrectly blocked solely by task status;
- duplicate prevention must run at execution time, not only during initial planning;
- uncertain POST outcomes must be reconciled before any retry;
- exact current trigger/menu/function ownership remains to be inventoried from the live 36-file source.

## Reorganization inventory still required

Before Install source code is moved or consolidated, capture:

- Install files/functions;
- public/menu/trigger entrypoints;
- sheets and headers read/written;
- Calendar source/write functions;
- Striven reports/API mutations;
- matching/resolution priorities;
- recovery functions;
- assignment/requested-by rules;
- fingerprints/idempotency rules;
- compatibility aliases and callers.
