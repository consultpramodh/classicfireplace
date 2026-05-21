# CF ServiceOps Clean Start

## What We Are Building

Classic Fireplace ServiceOps is a live service coordination system. It is not a CRM dashboard and not a calendar app.

The system starts with a webform intake and turns it into one operational object:

```text
Service Request
```

Everything else attaches to that request:

- Customer
- Location
- Fireplace / asset
- Opportunity
- Sales order / service work order
- Striven task
- Technician
- Calendar visibility
- Timeline events

## Source Of Truth

```text
Striven = operational source of truth
Google Sheets = local cache and control surface
Apps Script = production web app and sync layer
Google Calendar = read-only visual schedule layer
OpenAI = recommendation and explanation layer
Human operator = final approval authority
```

Google Calendar must never become the operational database.

## Product Surfaces

### Production Surface

Apps Script web app:

- `apps-script/Index.html`
- `apps-script/Code.js`
- deployed to the existing Classic Fireplace Apps Script project

This is the surface office staff should use.

### Lab / Prototype Surface

Next.js app:

- `app/*`
- `components/*`
- `lib/*`

This is useful for experiments, tests, Agents SDK work, and future richer UI, but it should not be treated as the current production UI unless explicitly migrated.

## Phase 0: Stabilize The Foundation

### Goal

Stop mixing prototypes, production UI, and server logic.

### Work

1. Split Apps Script server code into logical modules when deployment safety allows:
   - core config
   - sheets/cache
   - Striven reports
   - request normalization
   - customer/location matching
   - request state engine
   - calendar read-only layer
   - web app API functions

2. Clean `apps-script/Index.html`:
   - remove hardcoded prototype arrays
   - keep one live data adapter
   - keep one renderer per view
   - no duplicate render functions

3. Create one canonical `ServiceRequest` shape:
   - request ID
   - customer/location/fireplace
   - IDs for customer, opportunity, SO, task
   - request status
   - derived lane
   - warnings/blockers
   - schedule visibility
   - next action

4. Keep all writes safe:
   - UI actions log only unless explicitly enabled later
   - calendar remains read-only
   - Striven writes remain gated

## Phase 1: Operator Home

### Default Page

Today View.

It should answer:

```text
What needs action today?
```

### Must Show

- urgent requests
- overdue items
- needs review
- ready for scheduling
- today technician workload
- stale sync warnings
- next best work

### Must Avoid

- giant paragraphs
- CRM tables as the default
- technical states
- duplicate badges
- decorative AI widgets

## Phase 2: Webform Inbox

The inbox is intake-focused.

Default row/card should show:

- customer
- city / region
- short issue
- customer status
- risk
- age
- next action

Details go into a side panel.

## Phase 3: Kanban Board

Board lanes:

1. New Requests
2. Review Queue
3. Ready for Scheduling
4. Scheduled Ahead
5. Today’s Operations

Closed work belongs in an activity rail, not a full lane.

Today’s Operations groups by technician inside the lane:

- Chris
- Travis
- Matt
- Unassigned

## Phase 4: Customer Match

Replace confidence-first UI with evidence-first UI.

Show:

- matched on phone
- matched on email
- matched on address
- conflicts
- possible duplicates
- recommended action

Operators should trust evidence, not a naked percentage.

## Phase 5: Scheduling

Striven Tasks are primary.

Calendar is secondary and read-only.

Calendar restrictions:

- only configured technician calendars
- no calendar writes
- Chris and Travis require Classic Fireplace creator or organizer
- Matt uses the explicit configured calendar

## Current Technical Findings

- Tests are passing.
- Apps Script calendar scope is read-only.
- Calendar write guard methods exist.
- Apps Script UI currently contains duplicated static prototype data and live wiring.
- Apps Script server code is functional but too monolithic for long-term clarity.
- Git root is above the project folder, so status output includes unrelated user-directory files. Be careful with broad git operations.

## Immediate Next Step

Clean `apps-script/Index.html` into a production-safe shell:

- remove static prototype request/task/calendar arrays
- keep the Google Workspace visual direction
- load all visible data from `getDashboardData()`
- use local fallback only in a clearly marked demo mode
- preserve safe operator action logging

