# CF ServiceOps Phase 1 Operational Refactor

## Architecture Plan

Phase 1 keeps the current Apps Script deployment, Striven report sync, Google Sheets cache, and existing safe write boundaries. The shift is conceptual: every webform row is normalized into a `ServiceRequest`, and downstream Striven objects attach to that request instead of driving the operator UI.

## Reusable Structure

- `apps-script/Code.js` remains the server-side data adapter for Apps Script.
- `apps-script/Index.html` remains the deployed operator UI.
- Existing report refresh jobs and sheet names stay intact.
- Current Striven writes remain gated and are not called by Kanban movement.

## Request State Engine

`RequestStateEngine` resolves one unified state object:

- `operationalStage`: New, Review, Ready, Scheduled, Active, Closed
- `visualState`: label, tone, lane, accent
- `warnings`
- `blockers`
- `matchStatus`
- `nextAction`

UI views consume this object instead of recalculating workflow state independently.

## Matching Engine

Weighted matching now supports a property-first model:

- Location and street/postal matching
- Existing work at address
- Existing assets at address
- Customer email, phone, alt phone, and name signals

Thresholds:

- `90+`: matched
- `70-89`: review
- `<70`: new customer candidate

## Kanban Structure

The operational board uses six lanes:

- New Requests
- Review Queue
- Ready for Scheduling
- Scheduled Ahead
- Today’s Operations
- Closed

Cards use subtle accents, compact identifiers, and request-first language.

`Today’s Operations` is an execution lane, not a status. It groups today’s work by technician inside the lane: Chris, Travis, Matt, and Unassigned. Collapse preferences are stored in `serviceops.todayOperations.techCollapseState`.

## Request Status System

Operators can change a request status directly on a card. The dropdown is intentionally compact and drives lane placement:

- New Request -> New
- Contact Attempted -> New
- Waiting Customer -> Review
- Review Required -> Review
- Approved -> Ready for Scheduling
- Scheduled -> Scheduled Ahead unless appointment date is today
- In Progress -> Today’s Operations
- Waiting Parts -> Review Queue
- Follow-Up Required -> Review Queue
- Completed -> Closed
- Cancelled -> Closed

This remains an optimistic local workflow status in Phase 1. It is logged for audit visibility and does not write to Striven.

## Assistant Integration

The assistant is treated as a contextual intelligence panel. Card-level assistant controls are low-weight utility icons in the card header and open the right-side slide-over. The assistant is read-only in Phase 1.

## Real-Time Sync Flow

For Phase 1, the board supports optimistic local state movement:

1. Operator drags a card.
2. The card updates immediately in the browser.
3. The move is stored in local browser state.
4. A safe `Kanban Move` audit log entry is written.
5. No Striven record is created or updated.

Future phases can replace local overrides with server-side event sourcing.

## Future Interfaces

Reserved extension points:

- AI dispatch recommendations
- SLA tracking
- technician mobile app
- notification engine
- analytics and event sourcing
- customer assistant

## Cleanup Notes

Removed directionally:

- prompt-based blocking popups
- density toggles as primary workflow controls
- UI-only Kanban stage definitions
- backend-centric language in visible board state

## Migration Notes

No sheet rename or Striven API contract change is required. Existing data remains valid. The UI may show `#NEW` until a confident cached match supplies a Striven customer number.
# Phase 1 Update From Latest Research

Phase 1 should prioritize workflow safety before adding more UI surface area.

The updated remediation blueprint is now captured in [serviceops-remediation-blueprint.md](./serviceops-remediation-blueprint.md). Treat that file as the implementation order for backend hardening and operator-flow simplification.

Immediate build order:

1. canonical Script Properties registry
2. lock-based Striven token service
3. shared Striven HTTP retry wrapper
4. shared paginated report sync loop
5. durable Web Form row writeback
6. approval gate before SO/SWO creation
7. idempotent opportunity and SO/SWO create preflight

Do not continue expanding dashboards until these controls are verified.
