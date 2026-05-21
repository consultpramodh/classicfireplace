# CF ServiceOps Remediation Blueprint

This blueprint converts the updated research report into implementation rules for the existing Apps Script, Google Sheets, Striven, and ServiceOps UI system.

The goal is not to rebuild the platform. The goal is to make the current platform safer, simpler, faster, and easier for non-technical operators to trust.

## Operating Model

ServiceOps is a workflow control system.

The production system must have:

- one canonical Script Properties registry
- one lock-based Striven token service
- one Striven HTTP transport policy
- one paginated report sync framework
- one customer/contact/location dedupe service
- one durable writeback contract
- one approval gate before SO/SWO creation
- one visible operator queue with next actions
- one append-only audit/checkpoint trail

Avoid adding parallel state systems. Sheets can hold operational rows and read models, but Striven remains the record of authority for customers, locations, contacts, opportunities, SO/SWO, and tasks.

## Source Of Truth Rules

| Domain | Authority | Local role |
|---|---|---|
| Intake request | Web Form row | Queue item and durable ID holder |
| Customer | Striven | Cached matching read model |
| Location | Striven | Cached resolution read model |
| Contact | Striven | Cached/contact-association read model |
| Opportunity | Striven | Cached approval/status read model |
| SO/SWO | Striven | Cached reconciliation read model |
| Service task | Striven | Cached schedule/completion read model |
| Technician calendar | Google Calendar | Scheduling signal only |
| Review | ServiceOps | Human exception and approval queue |
| STATUS | ServiceOps | Append-only audit/checkpoint ledger |

## Durable ID Contract

Every processed Web Form row must carry these fields or their current equivalent:

- `Request Key`
- `Striven Customer ID`
- `Primary Location ID`
- `Contact ID`
- `Striven Opp ID`
- `Striven SO ID`
- `Sales Order Number`
- `SWO#`
- `Task ID`
- `Calendar Event ID`
- `Pipeline State`
- `Last Processed At`
- `Last Error`
- `Process Version`

Retries are unsafe unless these values are patched back consistently after each successful remote step.

## Immediate Backend Phases

### Phase 1: Config And Auth Discipline

Implement or verify:

- canonical Script Properties schema in `001_Core_Config.gs`
- legacy aliases readable, canonical names writable
- no direct property reads scattered through feature modules
- `STRIVEN_REFRESH_TOKEN` support if the current auth flow requires it
- lock-based token refresh in `002_Core_Auth.gs`
- cache invalidation after canonical property writes

Acceptance checks:

- missing required config throws a plain error
- legacy aliases still work during migration
- simultaneous token refresh does not corrupt token state

### Phase 2: Shared Transport And Pagination

Implement or verify:

- all Striven calls go through `003_Core_Http.gs`
- retry only network, `429`, and `5xx`
- never blindly retry create calls
- all v2 reports use `PageIndex` and `PageSize`
- continue fetching until `rows.length < pageSize`
- write sync checkpoints to `STATUS`

Acceptance checks:

- a three-page report sync loads all pages
- a failed page retry resumes the same page
- each report job uses the shared pagination loop

### Phase 3: Idempotent Intake Chain

Implement or verify:

- stable `requestKey` generated per Web Form row
- customer dedupe scorer is centralized
- ambiguous matches route to Review
- duplicate emails reuse existing contacts
- opportunity create uses read-before-create and an external reference
- SO/SWO create is blocked unless approval is explicit
- remote success plus local writeback failure reconciles instead of duplicating

Acceptance checks:

- rerunning the same row does not create duplicate customer, opportunity, or SO/SWO records
- `TEST_MODE` prevents live writes
- approval-off SO/SWO creation is blocked with a clear reason

### Phase 4: Reconciliation And Audit

Implement or verify:

- state is derived from durable IDs plus Striven report evidence
- task completion updates opportunity state only after report evidence confirms it
- calendar mapping ignores external/non-company organizers
- `STATUS` stores checkpoints, errors, sync counts, and process version
- Review is the only manual exception queue

Acceptance checks:

- stale report data is shown as stale, not silently trusted
- external organizer events are excluded
- operators can see last sync time and blocker reason in one place

## Operator UI Contract

Every row or work item must show:

- customer name
- city or service location
- short service issue
- current state
- blocker, if any
- data freshness
- one primary next action

Do not make operators infer state by switching between Sheets, Striven, calendar, and hidden status tabs.

## UI Layout Rules

Use a three-zone workspace:

1. left navigation by workflow state
2. central queue or work item
3. right context rail for checklist, IDs, audit, and assistant support

Screen behavior:

- command view starts with work needing action, not vanity analytics
- pipeline focus views render as dense queues
- work item pages use compact rows, not oversized tiles
- admin pages use plain forms and validation summaries
- no page-level horizontal overflow
- no card should be cut off by hidden scroll containers

## Color And Contrast Rules

Use color as status language, not decoration.

| Meaning | Color family |
|---|---|
| New or informational | Blue |
| Ready, verified, completed | Green |
| Waiting, stale, needs review | Amber |
| Blocked, failed, critical | Red |
| AI or assistant | Purple |
| Passive, disabled, archived | Grey |

Rules:

- normal text contrast must be at least 4.5:1
- large text and icon controls must be at least 3:1
- never use gold text on white
- never use muted grey on beige
- never use green on green
- never use red on dark backgrounds
- gold is brand emphasis, not warning
- every colored status needs text or an icon

## Test Matrix

| Test | Required result |
|---|---|
| Config aliases | canonical wins; legacy aliases remain readable |
| Token refresh race | one refresh path wins safely |
| Dedupe scorer | exact matches auto-match; ambiguous matches route to Review |
| Approval gate | SO/SWO create blocked until approved |
| Paginated report | all pages ingested; checkpoint written |
| Partial remote success | retry reconciles and does not duplicate |
| Calendar organizer filter | non-company events excluded |
| TEST_MODE | no live write occurs |
| HTTP retry | `401`, `429`, and `5xx` handled predictably |
| Operator screen | next action visible without tab hopping |

## Phase Order

1. Config registry and token lock
2. Shared HTTP and report pagination
3. Durable writeback and idempotency
4. Customer/contact/location dedupe scorer
5. Opportunity and SO/SWO approval gate
6. Task, calendar, and completion reconciliation
7. Operator queue and work item UI hardening
8. Read-only AI lookup with freshness and source stamps

## Non-Negotiables

- Do not replace Apps Script, Google Sheets, Striven, or the current deployment model.
- Do not add external databases or alternate CRMs.
- Do not introduce duplicate create paths.
- Do not let manual reruns be unsafe.
- Do not hide blocker state from operators.
- Do not let dashboards show stale data without a freshness label.
