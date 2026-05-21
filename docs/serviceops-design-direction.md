# CF ServiceOps Design Direction

## References

Reference sources provided:

- styles.refero.design
- designmd.me
- open-design.ai
- designmd.supply
- getdesign.md
- aura.build
- neuform.ai
- design-md.hyperbrowser.ai
- typeui.sh

Reference image direction:

- curated prompt library surfaces
- soft operational dashboards
- rounded application shells
- high whitespace but not dead space
- precise card grids
- large typography where it matters
- small chips and controls
- elegant icon-led navigation

## Interpretation For ServiceOps

Do not copy landing-page hero layouts.

ServiceOps is an operational system, so the useful lessons are:

- strong visual hierarchy
- exact spacing
- clean cards
- restrained color
- obvious grouping
- polished empty states
- fewer controls visible at once
- data compressed into useful operational decisions

The target should feel like:

```text
Google Workspace + Linear + Apple Settings + dispatch control room
```

Not:

```text
CRM table + SaaS dashboard template + colorful kanban toy
```

## Design Principles

### 1. One Screen, One Job

Every page must answer one question.

- Today View: what needs action now?
- Inbox: what came in?
- Kanban: where is each request in the workflow?
- Customer Match: is this the right customer/location?
- Schedule: who is doing what and when?
- Admin: is the system healthy?

### 2. Cards Are Structured, Not Decorative

Cards must use the same internal order:

1. Identity
2. Location
3. Problem
4. Status
5. Next action

No card should become a paragraph box.

### 3. Color Means State Only

Color is not decoration.

- Blue: new / information
- Amber: review / waiting
- Red: blocked / critical
- Green: ready / completed
- Purple: AI / intelligence
- Grey: closed / passive

Cards stay mostly white. Use color as:

- left accent
- small chip
- lane header tint
- icon background

### 4. Typography Must Be Predictable

Use only five text roles:

- Page title
- Section title
- Card title
- Body
- Metadata

Avoid random bolding.

### 5. Side Panels Carry Detail

Default views should never show all fields.

Use side panels for:

- full customer/contact details
- full request note
- fireplace details
- Striven IDs
- AI summary
- timeline
- action history

### 6. Operational Age Is Always Visible

Every request should show one time-pressure cue:

- 12m ago
- 6h waiting
- 2d stale
- overdue
- today
- tomorrow

## Visual System

### Canvas

- Background: cool off-white / soft blue grey
- Main panels: white
- Borders: soft cool grey
- Shadows: shallow, diffuse
- Radius: 14-24px depending on surface

### Navigation

Preferred production direction:

- fixed left navigation
- compact icon + label
- active pill state
- collapsible sidebar
- no body-level scroll fighting

### Header

Header should contain:

- page title/status
- universal search / command palette
- refresh/sync state
- assistant trigger
- account/profile

Avoid duplicated assistant buttons.

### Cards

Card anatomy:

```text
#NEW / #Customer · Customer Name
City · Fireplace
Issue label
[Status chip] [Risk chip]
Footer: age / tech / next step
```

Default max text:

- title: 1 line
- location/fireplace: 1 line
- issue: 1-2 lines
- footer: 1 line

## Page Direction

### Today View

The homepage.

Layout:

- left: urgent queue
- center: today workflow
- right: technician workload + assistant intelligence

### Webform Inbox

Use semi-card rows, not a dense spreadsheet.

Rows should prioritize:

- customer
- issue
- city
- status
- age
- next action

### Kanban

Use Trello-like tiles inside calm lanes.

Lanes:

- New Requests
- Review Queue
- Ready for Scheduling
- Scheduled Ahead
- Today’s Operations

Closed goes to activity rail, not a full lane.

### Customer Match

Evidence-first comparison.

Replace confidence-first cards with:

- incoming request
- matched customer/location
- matched on
- not matched
- conflicts
- approve/reject/create new

### Schedule

Hybrid dispatcher layout:

- unscheduled queue
- technician schedule
- route/cluster intelligence

Calendar remains visual only.

## Immediate Design Cleanup Targets

1. Remove static prototype arrays from Apps Script UI.
2. Build a real Today View first.
3. Rebuild Inbox as semi-card rows.
4. Rebuild Kanban as compact tiles with side-panel detail.
5. Make assistant one contextual panel, not floating duplicated buttons.
6. Standardize status/risk/opportunity chips.
7. Remove native browser prompts and alerts.
8. Stop showing raw technical fields unless Admin mode is active.

