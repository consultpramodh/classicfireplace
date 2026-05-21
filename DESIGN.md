# CF SERVICEOPS — DESIGN.md

## Visual Theme & Atmosphere

CF ServiceOps is an operational workspace for a fireplace service company.

The interface should feel:

- calm
- focused
- operational
- modern
- trustworthy
- human

This is NOT:
- an ERP
- an analytics dashboard
- a spreadsheet UI
- an admin panel

The product should feel like:

Google Workspace
+ Linear
+ Apple operational clarity
+ dispatch control system

The emotional tone is:

"Calm operational control."

Operators should feel:
- organized
- guided
- never overwhelmed

The interface should reduce operational anxiety.

Whitespace is preferred over borders.
Hierarchy is preferred over density.
Focus is preferred over feature exposure.

---

# Layout System

## Primary Layout Structure

Use a 4-zone workspace layout:

1. LEFT NAVIGATION
2. MAIN WORKSPACE
3. CONTEXT PANEL
4. RIGHT ICON RAIL

Never use:
- giant dashboard grids
- multi-row analytics layouts
- crowded card matrices

The UI must feel like a workspace.

---

# Left Navigation

The left sidebar behaves like Gmail or Linear.

Purpose:
- navigation
- operational queues
- filters
- work states

Never place analytics here.

Navigation items are operational states.

Examples:
- All Requests
- New Intake
- Needs Review
- Approved for SWO
- Scheduled
- Automation Errors

Navigation labels must be human-readable.

Avoid:
- internal object names
- CRM jargon
- pipeline mechanics

---

# Main Workspace

The center workspace is the operational execution surface.

This is the primary focus area.

Main surfaces:
- intake requests
- task queues
- customer detail
- scheduling
- approvals

The main workspace must always answer:

"What should the operator do next?"

Avoid:
- passive reporting
- vanity metrics
- analytics-first design

---

# Right Context Panel

The right panel is NOT a widget dashboard.

It is a contextual intelligence surface.

Behavior:
- opens on demand
- collapsible
- contextual to selected item

Examples:
- selected customer
- task details
- technician schedule
- automation warnings
- sales order state

The panel should behave like:
- Gmail side panels
- Google Calendar detail drawers
- Linear issue sidebars

---

# Right Icon Rail

Inspired by:
- Gmail
- Google Workspace
- Notion
- Linear

The icon rail sits at the far right edge.

It contains:
- Tasks
- Calendar
- Sales Orders
- Automation
- Notes

Behavior:
- clicking opens corresponding side panel
- clicking again collapses
- only one active panel at a time

Icons:
- monochrome
- minimal
- rounded hover states
- subtle active backgrounds

No neon.
No gradients.
No glassmorphism.

---

# Visual Language

## Primary Style

Use:
- warm white backgrounds
- soft gray surfaces
- subtle blue accents
- extremely restrained shadows

Avoid:
- hard black
- high contrast dashboards
- crypto aesthetics
- SaaS gradients
- neon UI

Preferred feel:
- Google Workspace
- Linear light mode
- Apple utility apps

---

# Typography

Primary font:
- Inter

Fallbacks:
- system-ui
- SF Pro
- Segoe UI

Typography should create hierarchy.

Use:
- spacing
- weight
- rhythm

Avoid:
- oversized headings
- marketing typography
- decorative fonts

---

# Color System

## Primary Colors

Background:
- #F6F8FC

Surface:
- #FFFFFF

Surface Soft:
- #F8FAFD

Border:
- #DDE3EE

Text:
- #1F2937

Muted Text:
- #657386

Primary Accent:
- #1A73E8

Primary Accent Soft:
- #E8F0FE

Success:
- #188038

Warning:
- #B06000

Error:
- #B3261E

Purple Context:
- #6F42C1

Colors must be semantic.

Never use colors decoratively.

---

# Elevation & Shadows

Shadows must be subtle.

Use:
- soft operational elevation

Avoid:
- floating cards
- dramatic glow
- excessive blur

The UI should feel grounded.

---

# Border Radius

Rounded corners should be soft and modern.

Preferred:
- 14px
- 16px
- 18px
- 22px

Avoid:
- sharp corners
- over-rounded blobs

---

# Data Density

The system is data-heavy.

But it must NEVER feel crowded.

Rules:
- progressive disclosure
- contextual detail
- expandable sections
- hide secondary information by default

Operators should not see:
- implementation details
- sync mechanics
- raw object relationships

---

# Operational Hierarchy

Primary operational truth:

Striven Tasks

Secondary:
Google Calendar

Calendar is visual only.

Tasks are operational truth.

The UI hierarchy must reinforce this.

---

# Calendar Philosophy

Google Calendar is:
- read-only
- schedule visibility
- contextual

Calendar is NOT:
- operational source of truth
- dispatch controller
- workflow engine

---

# Task Design

Tasks are the core operational object.

Every task should contain:
- technician
- customer
- phone
- location
- service window
- SO number
- task status
- sync state
- notes

Tasks should feel actionable.

Not informational.

---

# Cards

Cards should:
- guide action
- reduce cognitive load
- expose one primary action

Avoid:
- giant metric dashboards
- 15-button cards
- overloaded tables

---

# Tables

Tables are secondary surfaces only.

Avoid spreadsheet feeling.

Use:
- row breathing room
- minimal borders
- inline actions
- sticky headers
- subtle hover states

---

# Motion

Motion should be:
- subtle
- operational
- informative

Examples:
- panel transitions
- collapses
- hover feedback

Avoid:
- decorative animation
- bouncing
- flashy movement

---

# Mobile Philosophy

Mobile should feel like:
- Google Tasks
- Linear mobile
- Gmail mobile

NOT:
- mini desktop dashboard

Mobile is:
- task-first
- timeline-first
- action-first

---

# Interaction Rules

Every screen must have:
- one dominant action
- one operational focus

Avoid:
- decision overload
- equal-weight buttons
- too many accents

---

# Error Handling

Errors must be operationally useful.

GOOD:
- "Customer match not found"
- "Missing location ID"
- "Task date mismatch"

BAD:
- stack traces
- raw API errors
- technical exception dumps

Technical details belong in:
- admin mode
- expandable diagnostics

---

# AI Generation Rules

When generating UI:
- prioritize operational clarity
- reduce visual noise
- preserve whitespace
- simplify aggressively

Never generate:
- generic Tailwind dashboards
- crypto SaaS UI
- analytics-heavy admin templates

Always favor:
- workspace behavior
- contextual navigation
- task execution
- operational calm

---

# Architectural Philosophy

CF ServiceOps is an operational workspace.

NOT a dashboard.

Dashboards display information.

Workspaces help people execute operations.

All UI decisions must support execution speed,
clarity,
and operational trust.

---

# Implementation Contract

This file is not only a mood board.

It is the implementation contract for CF ServiceOps UI.

When a design choice conflicts with this file, this file wins.

The detailed operator-first standards live in:

```text
docs/serviceops-operator-ux-guidelines.md
```

Those guidelines are part of this contract. They define non-technical operator rules, color combinations, contrast rules, button wording, responsive behavior, and anti-confusion patterns.

---

# Operator-First Rules From Research

The research report's useful UI direction is:

- one queue
- one work item
- one visible next action
- one Review path
- visible data freshness
- plain-language blockers
- error prevention before Striven writes
- recognition over recall
- minimalist task screens

Every operator-facing screen must answer within five seconds:

```text
What should I do next?
Can I trust the data?
What is blocking the workflow?
```

If the answer is not obvious, reduce the screen.

---

# Colour And Contrast Contract

Color is semantic only.

Allowed meanings:

- Blue: information
- Green: ready, verified, completed, safe
- Amber: stale, waiting, caution, needs review
- Red: blocked, failed, critical, destructive risk
- Purple: AI / assistant only
- Grey: passive, disabled, archived, metadata

Contrast rules:

- Body text must meet 4.5:1 contrast or better.
- Large text and icons must meet 3:1 contrast or better.
- Gold cannot be used as small text on white.
- Muted grey cannot sit on beige if it becomes hard to read.
- Green cannot sit on green.
- Red cannot sit on dark backgrounds.
- Status color must always be paired with text or icon.

Classic Fireplace green/gold may be used for brand and selected states, but never as a one-note theme. The UI must not become all green, all gold, beige, brown, or decorative.

---

# Non-Technical Operator Language

Use:

- Resolve Customer
- Create Opportunity
- Check Opportunity
- Create SWO
- Sync Status
- Open Review
- Missing service location
- Opportunity is not approved for SWO yet

Avoid:

- Submit
- Run
- Process
- pipelineState
- API_ERROR
- SERVICE_SO_CREATED
- JSON
- endpoint
- token
- stack trace

Technical labels belong in Admin or an expanded System section only.

---

# Page-Specific Rules

## Today View

Purpose:
- answer what requires action now

Must show:
- urgent requests
- overdue requests
- today technician workload
- waiting customer items
- ready for scheduling items
- sync health if degraded

Must hide:
- raw IDs
- API responses
- full notes
- debug fields

Primary action:
- open the highest-priority request

## Webform Inbox

Purpose:
- process incoming webform requests

Default layout:
- semi-card rows
- not a spreadsheet export

Each row must show:
- customer
- city / region
- short issue label
- request age
- status
- risk
- next action

Long text belongs in the context panel.

## Kanban Board

Purpose:
- show operational state at a glance

Lanes:
- New Requests
- Review Queue
- Ready for Scheduling
- Scheduled Ahead
- Today’s Operations

Closed work belongs in an activity rail, not a full lane.

Cards must be compact.

Do not show:
- full notes
- more than two visible chips
- permanent dropdowns
- giant buttons

## Customer Match

Purpose:
- help the operator trust or reject a customer/location match

Use evidence-first layout.

Show:
- incoming request
- matched customer/location
- matched on
- not matched
- conflicts
- recommended action

Do not lead with confidence percentages.

## Schedule

Purpose:
- coordinate technician workload

Striven Tasks are primary.

Google Calendar is read-only schedule visibility.

Calendar must not:
- create events
- edit events
- delete events
- determine operational truth

## Admin Settings

Purpose:
- configure and diagnose the system

Admin Settings may show:
- script properties
- cache freshness
- integration health
- required URLs/API keys
- limits
- feature flags
- sync settings
- masked secrets

Admin Settings must:
- mask secrets
- log every setting change
- explain impact in plain language
- separate required from optional settings

Admin Settings must not:
- expose full secret values
- use raw stack traces as primary error copy
- be mixed into operator workflow

## Agent Logs

Purpose:
- explain what ran, when, and what changed

Logs should be structured.

Each entry should show:
- timestamp
- job/action
- severity
- short summary
- expandable details

---

# Component Anatomy

## Request Row

Required order:

1. Customer name
2. Request age
3. City / region
4. Issue label
5. Status chip
6. Risk chip
7. Next action

Height:
- 64-88px default

No paragraph text in the default row.

## Request Card

Required order:

1. `#NEW` or `#Customer` + customer name
2. City + fireplace
3. One-line issue
4. Max two chips
5. Footer with age / tech / schedule

Collapsed height:
- 120-160px

## Detail Drawer

Tabs:
- Overview
- Customer
- Scheduling
- Timeline
- System

System tab is collapsed by default.

## Setting Row

Required order:

1. Human label
2. Script property key
3. Help text
4. Input/select/textarea
5. Status chip
6. Save action

Secrets:
- render blank input
- placeholder says configured if present
- never display full value

---

# Density Rules

Desktop default:
- 8-12 actionable items visible per screen

Compact request rows:
- 64-88px tall

Kanban cards:
- 120-160px collapsed

Side panels:
- 380-460px wide

Long text:
- always behind expand/drawer

---

# Status Language

Allowed operator-facing statuses:

- New Request
- Contact Attempted
- Waiting Customer
- Needs Review
- Approved
- Ready for Scheduling
- Scheduled Ahead
- Today
- In Progress
- Waiting Parts
- Follow-Up Required
- Completed
- Cancelled
- Blocked

Banned visible statuses:

- CUSTOMER_RESOLVED
- SERVICE_SO_CREATED
- API_ERROR
- pipeline state
- raw automation state
- raw exception class names

---

# Operational Age Rules

Every request must show time pressure.

Allowed examples:

- Just now
- 12m ago
- 2h ago
- 1d waiting
- 3d stale
- Overdue
- Today
- Tomorrow

If the system cannot determine age, show:

```text
Time unknown
```

Do not silently omit age.

---

# Assistant UX Rules

Assistant is a contextual intelligence layer.

Use:
- one global assistant button
- contextual assistant inside side panel
- read-only recommendations
- evidence/source summary

Avoid:
- floating duplicated bubbles
- assistant buttons on every surface
- glowing AI styling
- AI as final authority

Assistant must say when:
- data is missing
- confidence is low
- deterministic checks should override AI

---

# Operator vs Admin Separation

Operator mode hides:
- raw IDs
- API responses
- script properties
- stack traces
- token/cache internals
- report URLs

Admin mode may show:
- cache freshness
- integration health
- masked script properties
- logs
- raw IDs
- diagnostic details

---

# Accessibility Rules

Minimum body text:
- 14px

Minimum control target:
- 40px height

Color cannot be the only indicator.

Every icon-only control needs:
- tooltip or visible label

Font scaling must be supported later for older operators.

---

# Motion Timing

Panel open:
- 180-220ms

Hover:
- 120-160ms

Collapse:
- 180ms

No bounce.
No decorative looping motion.

---

# Anti-Patterns

Do not use:

- native prompt dialogs
- full-card pastel fills
- giant metric dashboard homepage
- duplicated assistant buttons
- horizontal sprawl
- dense table as default view
- raw technical state labels
- overloaded cards
- unrelated analytics in navigation
- decorative gradients
- noisy shadows

---

# Acceptance Criteria

An operator must understand the next action within 5 seconds.

The default desktop view must not require horizontal scrolling at 1440px.

No operator page should expose raw technical IDs unless expanded.

Every action must provide visible feedback.

Every save or operational action must create an audit log entry.

Calendar must remain read-only.

Striven writes must remain gated until explicitly enabled.

---

# Blank-Slate Rebuild Rules

When a screen repeatedly fails the product direction, do not keep layering fixes on top of it.

Start that screen from a clean surface while preserving:

- backend functions
- integration contracts
- audit logging
- script properties
- cache/report sheets
- read-only safety rules

Remove or hide:

- legacy prototype pages
- unused navigation links
- duplicated assistant entry points
- static demo-only page fragments
- table/card hybrids that no longer match the workflow

The operator-facing product should expose only the current approved workflow.
Experimental pages belong in prototypes or docs, not production navigation.

---

# Admin Settings Page Contract

Admin Settings is the technical control surface for configuration, not an operator workflow page.

It must be able to stand alone as the only visible page during foundation work.

Required categories:

- Striven
- Google Sheets
- Google Calendar
- OpenAI / Assistant
- Technician Rules
- Scheduling / Routing
- Parts / Inventory
- Workflow / Notifications / Security

Each setting must show:

- human label
- script property key
- current configuration state
- safe input control
- help text
- save action

Save behavior:

- write to backend Script Properties
- mask secrets on reload
- log every change to the backend approval/audit log
- show visible confirmation
- never expose full secret values

Admin Settings must not depend on request dashboard data loading first.
If Apps Script data fails, the page should still render with a clear error state.

---

# Page Removal Policy

Deleting a page means removing it from the visible production UI unless the user explicitly asks to delete source files.

Do not delete backend modules, deployed integration code, sync jobs, or data contracts as part of UI cleanup.

If a removed page contained business capability, preserve the capability as:

- a hidden backend function
- a documented future module
- a placeholder in `docs/`
- a collapsed Admin diagnostic

Never remove:

- Striven sync
- calendar read-only guardrails
- customer matching logic
- settings persistence
- audit logging
- script deployment helpers
