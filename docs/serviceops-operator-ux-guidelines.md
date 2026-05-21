# CF ServiceOps Operator UX Guidelines

These rules translate the ServiceOps critique into practical UI decisions. The goal is not to make the app look fancy. The goal is to help non-technical operators know what is happening, what needs attention, and what to do next without guessing.

## Core Operator Principle

Every operator screen must answer these questions in order:

1. What work needs attention?
2. What is the next safe action?
3. Is the data fresh enough to trust?
4. What is blocking progress?
5. Where can I see more detail if I need it?

If a screen does not answer those questions quickly, simplify the screen before adding features.

## Useful Ideas From The Research Report

Use these findings as product rules:

- Collapse the workflow into one queue, one detail view, and one visible next-action model.
- Every row must show current state, blocker, freshness, and next safe action.
- Show system status clearly: data freshness, stale snapshots, failed syncs, blocked actions.
- Prevent errors before they happen: duplicate customer, duplicate opportunity, duplicate SO/SWO, missing location, unapproved opportunity.
- Prefer recognition over recall: show valid choices, status labels, checklist results, and reasons instead of making staff remember process rules.
- Use plain-language recovery messages: say "Missing location ID" instead of exposing raw API errors.
- Keep the visible UI minimal: details, IDs, diagnostics, and raw fields belong in an expanded System/Admin view.
- Treat Review as the human exception queue, not a hidden second state machine.
- Treat the calendar as a scheduling signal, not the service-record source of truth.
- Treat AI answers as read-only unless they show data freshness and source evidence.

## Non-Technical Operator Rules

Operators should not need to know Striven object names, API behavior, or pipeline internals.

Use human labels:

- New Requests
- Needs Review
- Opportunity
- Approved for SWO
- Work Order Created
- Scheduled
- Completed
- Blocked

Avoid technical labels in operator mode:

- CUSTOMER_RESOLVED
- SERVICE_SO_CREATED
- API_ERROR
- pipelineState
- sourceRow
- JSON
- endpoint
- token
- stack trace

Technical details may appear only in Admin or an expanded System section.

## Navigation Rules

Keep production navigation short and state-based:

- Command
- New Requests
- Needs Review
- Opportunities
- Approved
- Work Orders
- Jobs Today
- Completed
- Errors
- Admin

Do not add separate top-level pages for every backend object. Customer matching, opportunity checks, SO/SWO gates, and scheduling should appear as steps inside the work item or pipeline lane.

## Page Rules

### Command

Purpose: help the operator start the day.

Must show:

- next best work
- review blockers
- data freshness
- failed syncs
- today schedule pressure

Must not become:

- a vanity dashboard
- an analytics wall
- a grid of decorative cards

### Pipeline

Purpose: show where work is stuck.

Lanes:

- New Requests
- Opportunity
- Approved for SWO
- Work Order Created
- Scheduled
- Completed
- Review

Each card must show:

- customer
- city
- short issue
- age/date
- one primary action
- at most two chips

### Work Item

Purpose: complete one request safely.

Must show:

- one primary next action
- readiness checklist
- blocker or review reason
- customer/contact/location summary
- linked Striven records only when useful
- timeline/audit in a secondary section

## Color System

Use color as a signal, not decoration.

### Base Colors

Use this base palette for operator surfaces:

```css
--page: #F6F8FC;
--surface: #FFFFFF;
--surface-soft: #F8FAFD;
--border: #DDE3EE;
--border-soft: #EEF2F7;
--text: #111827;
--text-secondary: #374151;
--text-muted: #64748B;
```

### Semantic Colors

Use these for status and actions:

```css
--info: #2563EB;
--info-soft: #EFF6FF;
--success: #188038;
--success-soft: #EAF7EE;
--warning: #B06000;
--warning-soft: #FFF7ED;
--danger: #B3261E;
--danger-soft: #FEF2F2;
--ai: #6F42C1;
--ai-soft: #F5F3FF;
```

### ServiceOps Luxury Accent

The Classic Fireplace / Rolex-inspired accent may be used sparingly:

```css
--cf-green: #0A332D;
--cf-green-2: #005234;
--cf-gold: #C6A15B;
--cf-gold-soft: #FBF0CC;
```

Rules:

- Use green/gold for brand shell, selected nav, and primary positive action emphasis.
- Do not make the entire UI green, gold, beige, or brown.
- Do not use gold for warnings. Warnings use amber/orange.
- Do not use green for neutral cards. Green means ready, verified, completed, or safe.

## Color Meaning Rules

- Blue: information, neutral navigation, selected read-only context.
- Green: verified, ready, completed, safe to continue.
- Amber: stale, waiting, review needed, caution.
- Red: blocked, failed, critical, destructive risk.
- Purple: assistant or AI recommendation only.
- Grey: passive, disabled, archived, metadata.

Do not use color only. Always pair it with text, icon, or status wording.

## Contrast Rules

Minimum contrast targets:

- Normal text: 4.5:1 or better.
- Large text and icon-only controls: 3:1 or better.
- Primary buttons: dark text on light background or white text on dark background with strong contrast.
- Disabled controls: visibly disabled but still readable.

Do not place:

- muted grey text on beige backgrounds
- gold text on white backgrounds
- green text on green backgrounds
- red text on dark backgrounds
- small white text over gradients

If contrast is uncertain, choose darker text and a lighter background.

## Button Rules

Every page should have one dominant action.

Button hierarchy:

- Primary: one per work item or major panel.
- Secondary: safe alternate action.
- Tertiary/link: navigation or low-risk detail.
- Destructive: rare, red, and requires confirmation.

Button labels must be verbs:

- Resolve Customer
- Create Opportunity
- Check Opportunity
- Create SWO
- Sync Status
- Open Review

Avoid vague labels:

- Submit
- Continue
- Process
- Update
- Run

## Copy Rules

Use plain language.

Good:

- Customer match not found.
- Missing service location.
- Opportunity is not approved for SWO yet.
- Calendar event is hidden because organizer is outside Classic Fireplace.
- Data is stale. Refresh before creating records.

Bad:

- Null LocationId.
- API returned 400.
- Pipeline mutation failed.
- Invalid object reference.
- Exception in serviceops-adapter.

## Layout Rules

Operators scan left to right, top to bottom.

Use this order:

1. customer / request identity
2. issue
3. current status
4. next action
5. blockers
6. supporting details
7. system details

Keep long text behind a drawer, expansion, or details section. Do not show long webform notes in compact rows.

## Responsive Rules

The app must never require page-level horizontal scrolling.

Requirements:

- Desktop: sidebar + main workspace.
- Tablet: compact sidebar or top nav, main content wraps.
- Phone: one-column task-first layout.
- Pipeline lanes wrap vertically on smaller screens.
- Calendar cards wrap; no forced week grid wider than the device.
- Tables become stacked rows or secondary admin-only surfaces.

Horizontal scrolling is allowed only inside explicitly labeled secondary widgets, never for the full page.

## Accessibility Rules

- Minimum body text: 14px.
- Minimum button height: 40px.
- Icon-only buttons require title/tooltip.
- Focus state must be visible.
- Error state must include text, not just color.
- Font scaling must not break layout.
- Touch targets must not overlap.

## Anti-Dumb UI Rules

Avoid anything that makes the system look generic, confusing, or toy-like:

- no random gradients
- no color blobs
- no giant KPI cards as the main experience
- no overloaded cards with five chips
- no raw data dumps
- no decorative AI glow
- no spreadsheet-first operator views
- no hidden critical status
- no equal-weight action buttons
- no horizontal sprawl

The UI should look boring in the best way: calm, precise, fast, and obvious.

## Acceptance Checklist

Before a screen is considered done:

- A non-technical operator can identify the next action within 5 seconds.
- The page does not exceed device width at phone, tablet, or desktop sizes.
- All statuses use human language.
- The data freshness state is visible.
- Every risky action has a visible gate or checklist.
- Error messages explain the operational fix.
- Color meaning is consistent.
- No raw IDs or technical values appear unless expanded.
- There is one primary action, not a cluster of competing buttons.
