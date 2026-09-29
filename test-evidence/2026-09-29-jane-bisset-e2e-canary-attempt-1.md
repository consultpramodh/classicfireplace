# Jane Bisset End-to-End Master Canary — Attempt 1

Date: 2026-09-29 (America/Toronto)

## Scope

- Release at canary start: `3.11.26-preinspection-c-prefix-r1`
- Event: `2g1s53ho1qf09d19vsep0p3v0h@google.com`
- Vertical: PreInspection
- Allowed date: `2026-09-30`
- Runner mode: `CANARY_EVENT_WRITE_FRESH`
- Canary run: `36625424757`

## Expected path

`Calendar read → fresh Step 7 contract → CREATE Task Type 105 → Requested By → Pool 8 → Calendar links/title → Striven read-back → Step 7 NO_CHANGE`

## Actual result

**BLOCKED BEFORE STRIVEN CREATE**

Artifact evidence:

`step1-calendar.json`

returned:

`The script does not have permission to perform that action. Required permissions: Calendar / Calendar readonly.`

The failure happened while V3 attempted its fresh Calendar read.

## Verified non-mutations

- no Striven POST occurred;
- no Jane Task appears in `Source Tasks`;
- no Jane Event-ID write audit was produced;
- no duplicate-create guard was consumed;
- canary manifest was reset to `SHADOW_READ_ONLY`.

## Trigger discovery

Before reinstall, seven Calendar triggers existed.

A managed-trigger reinstall was then attempted through the guarded web-app execution context. That context lacked Calendar authorization. The old installer deleted managed triggers first, recreated the eight clock triggers, failed all seven Calendar trigger creations, but incorrectly reported PASS.

Audit rows 661–667 contain the seven Calendar permission failures.

## Corrective release

Release: `3.11.27-trigger-install-safety-r1`

PR: #90  
Merge commit: `7f1224ac6dae9c380bb219dffebbf89d0b88db44`

The corrected installer:

- preflights Calendar access before trigger deletion;
- records Calendar creation failures as FAIL;
- verifies all configured Calendar IDs are installed;
- throws on an incomplete install.

Regression: **50/50 PASS**

Bootstrap: `36626085957` — SUCCESS  
Ledger: `36626085984` — SUCCESS

## Current trigger inventory

Inventory run: `36626244899`

Present:

- 1 daily source refresh clock trigger
- 5 scheduled operations clock triggers
- 1 install reminder clock trigger
- 1 hourly reconciliation fallback clock trigger

Missing:

- all 7 `tmv3_calendarEventUpdated` Calendar triggers

## Required next action

Run `tmv3_installTriggers()` once from the bound Apps Script editor under the authorized Classic Fireplace account and approve Calendar access if prompted.

Success criterion: **15 managed triggers = 8 clock + 7 Calendar**.

Then rerun this same Jane canary.
