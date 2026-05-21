# CF ServiceOps Design System V2

## Design Reference Summary

The provided references point toward a documented design-system workflow:

- real visual systems broken into tokens
- explicit typography and spacing rules
- cards with consistent anatomy
- clean prompt-library style layouts
- polished internal-tool dashboards
- high hierarchy with low clutter

The important idea is not to copy any single website. The important idea is to stop vague UI direction and make ServiceOps follow a written design system.

## Target Feel

```text
Calm operational command system.
Not CRM.
Not spreadsheet.
Not dashboard template.
Not decorative landing page.
```

This system is for operators who may not be technical. The interface must be obvious, plain-language, and forgiving. The design contract is expanded in [serviceops-operator-ux-guidelines.md](./serviceops-operator-ux-guidelines.md).

## Operator UX North Star

Every screen must quickly answer:

- What work needs attention?
- What should I do next?
- Is the data fresh enough to trust?
- What is blocking progress?
- Where do I open the details?

The research report's most useful UI finding is that ServiceOps needs visible system status, error prevention, recognition over recall, plain-language recovery, and minimalist task screens. This means one queue, one work item, one primary next action, and one review path.

Visual blend:

- Google Workspace clarity
- Linear precision
- Apple settings calm
- Notion-like information grouping
- DesignMD / TypeUI-style documented components

## Current UI Problems To Fix

### 1. Mixed Product Identity

The current UI combines:

- static prototype data
- live ServiceOps data
- Apps Script widgets
- older dashboard ideas
- partial admin tooling

Result: it feels inconsistent and unreliable.

### 2. Weak Hierarchy

Important operational content is not always visually dominant.

The issue, customer, age, and next action should dominate.
IDs and metadata should stay secondary.

### 3. Too Many Design Directions

The UI has shifted between:

- Apple soft dashboard
- Rolex colors
- Google Workspace
- Trello board
- Notion
- dense admin tables

We need one system.

### 4. Static Prototype Leakage

Hardcoded prototype arrays must be removed from production UI.

Production UI should have:

- live data adapter
- empty state
- loading state
- demo mode only when explicitly enabled

### 5. Admin Controls Feel Bolted On

Admin settings should feel like a real system configuration surface, not a late-added panel.

## Design Tokens

### Colors

Use a cool, quiet operational palette.

```css
--page: #F6F8FC;
--surface: #FFFFFF;
--surface-soft: #F8FAFD;
--border: #E2E8F0;
--border-soft: #EEF2F7;
--text: #0F172A;
--text-secondary: #475569;
--text-muted: #64748B;

--blue: #2563EB;
--blue-soft: #EFF6FF;
--green: #16A34A;
--green-soft: #ECFDF3;
--amber: #F97316;
--amber-soft: #FFF7ED;
--red: #DC2626;
--red-soft: #FEF2F2;
--purple: #7C3AED;
--purple-soft: #F5F3FF;
```

### Semantic Color Rules

- Blue: new, information, scheduled visibility
- Amber: review, waiting, stale
- Red: blocked, critical, failure
- Green: ready, verified, completed
- Purple: AI / assistant / intelligence
- Grey: closed, disabled, passive

Do not use color decoratively.

### Contrast And Color Combination Rules

- Normal text must meet at least 4.5:1 contrast.
- Large text and icons must meet at least 3:1 contrast.
- Never use gold text on white, muted grey on beige, green on green, or red on dark backgrounds.
- Color must never be the only indicator. Pair status color with text or an icon.
- Use green/gold brand accents sparingly for shell and selected states; do not let the UI become all green, all gold, beige, or brown.
- Gold is brand emphasis, not warning. Warnings are amber/orange.
- Red is only for blocked, failed, destructive, or critical risk states.
- Purple is only for assistant/AI context.

### Operator-Safe Status Colors

```text
New / informational: blue on blue-soft
Ready / verified / completed: green on green-soft
Waiting / stale / needs review: amber on amber-soft
Blocked / failed / critical: red on red-soft
AI recommendation: purple on purple-soft
Passive / archived / disabled: grey on surface-soft
```

### Typography

Use one UI font stack:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Text roles:

- Page title: 28-32px / 800 / tight
- Section title: 18-20px / 750
- Card title: 14-15px / 800
- Body: 13-14px / 500
- Metadata: 11-12px / 600 / muted

Avoid random bolding.

### Spacing

Use only:

```text
4, 8, 12, 16, 20, 24, 32
```

No arbitrary spacing.

### Radius

```text
Controls: 10-12px
Cards: 14-18px
Major panels: 22-28px
Pills: 999px
```

### Shadows

Use only soft shadows:

```css
--shadow-1: 0 1px 2px rgba(15, 23, 42, 0.05);
--shadow-2: 0 8px 24px rgba(15, 23, 42, 0.06);
--shadow-3: 0 18px 48px rgba(15, 23, 42, 0.10);
```

## App Structure

### Shell

Full-height app shell:

- fixed sidebar
- fixed topbar
- internal content scrolling only
- right-side contextual rail or drawer

### Sidebar

Keep simple:

- Today
- Inbox
- Board
- Customer Match
- Schedule
- Admin

Avoid long menus.

### Topbar

Must contain:

- current page title
- universal search
- sync status
- assistant button
- account/profile

No duplicated assistant buttons.

## Component Rules

### Request Row

Default intake row:

```text
Customer + age
Issue label + one-line summary
City / region
Status chip
Risk chip
Next action
```

No long paragraphs.

### Request Card

Kanban card:

```text
#NEW or #Customer · Customer Name
City · Fireplace
Short issue
[Status] [Risk]
Footer: age / tech / schedule
```

Max two visible chips.

### Detail Drawer

All full context belongs here:

- contact details
- full notes
- fireplace details
- customer match evidence
- opportunity info
- system IDs
- AI recommendation
- timeline

### Admin Setting Row

Each setting row:

- label
- property key
- short help text
- editable input
- status pill
- save action

Secrets:

- input blank by default
- placeholder says configured
- never render full value
- log only masked save event

## Page-by-Page Redesign

### Today View

This becomes the default page.

Sections:

- Needs action now
- Today technician workload
- Overdue / stale
- Ready for scheduling
- Data freshness

### Webform Inbox

Semi-card rows, not a spreadsheet.

Must show:

- New today
- Needs review
- Waiting customer
- High risk
- Ready scheduling

### Board

Trello-like operational tiles.

Lanes:

- New Requests
- Review Queue
- Ready for Scheduling
- Scheduled Ahead
- Today’s Operations

Closed in activity rail.

### Customer Match

Evidence-first split view:

- Incoming request
- Candidate customer/location
- Matched on
- Not matched
- Conflicts
- Action

Remove naked confidence cards.

### Schedule

Dispatcher hybrid:

- Unscheduled queue
- Technician schedules
- route/cluster hints

Calendar is read-only visibility only.

### Admin

Configuration dashboard:

- system readiness
- missing requirements
- editable settings by category
- integration health
- audit log link

## Hard Do Not Rules

Do not:

- use native prompt/alert dialogs
- show full raw API data to operators
- use giant paragraphs in cards
- use dense tables as first view
- use full-card color fills
- show more than two chips on compact cards
- duplicate assistant entry points
- mix static prototype data into production
- create Calendar events
- let Calendar determine operational truth
- make the page require horizontal scrolling
- use technical state labels in operator mode
- use vague button labels like Submit, Run, Process, or Update
- make non-technical users choose between multiple equal-weight actions

## Immediate Implementation Order

1. Replace Apps Script UI with a clean blank-shell implementation.
2. Add Today View first.
3. Add Inbox using live request data.
4. Add side drawer.
5. Add Admin Settings as first-class page.
6. Add Board after the request model is clean.
7. Add Schedule after Striven task/calendar merge is stable.
