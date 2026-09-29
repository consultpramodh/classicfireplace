# TMV3 3.11.26 PreInspection C# Title Standard — Verification Evidence

Date: 2026-09-29 (America/Toronto)

## Decision

Canonical PreInspection Calendar titles use:

`C#<Customer Number> - <Customer Name> - <Phone>`

Legacy `Cust#` titles remain readable for compatibility, but all new normalization writes `C#`.

## Rule synchronization

Updated together:

- `PROJECT_OPERATING_RULES.md`
- `TMV3_HARD_RULES.PreInspection.calendarTitlePrefix`
- runtime hard-rule assertion
- Calendar customer-number parser
- PreInspection customer-name parser
- canonical title generator
- regression coverage
- `PROJECT_CURRENT_STATE.md`

Hard-rule revision: `2026-09-29-r2`.

## Compatibility

Verified:

- new `C#62400 - John Smith - (416) 555-1212` parses Customer Number `62400`
- legacy `Cust#62400 - John Smith - (416) 555-1212` still parses Customer Number `62400`
- new `C#` prefix is removed cleanly from extracted customer name
- Install title format remains unchanged

## Regression

Release: `3.11.26-preinspection-c-prefix-r1`

Pure regression:

- cases: **50**
- passed: **50**
- failed: **0**

## GitHub

- pre-change checkpoint: `checkpoint/tmv3-c-prefix-pre-2026-09-29`
- work branch: `work/tmv3-c-prefix-r1`
- PR: #89
- merge commit: `6fd144699cb531735ad230a985d361f7821d24e0`

## Bound Apps Script verification

Guarded bootstrap run: `36624855596`

Result:

- PRE source parity verified before push
- source pushed to bound Script ID `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`
- remote re-clone completed
- **22/22 files hash-verified**
- status: `CLEAN_V3_SOURCE_VERIFIED`

System remains Stage 7 / `SHADOW_READ_ONLY`.

## Jane Bisset live Calendar verification

Event ID:

`2g1s53ho1qf09d19vsep0p3v0h`

Read-back after update:

- title: `C#62638 - Jane & Neil Bisset - (416) 399-6519`
- location: `16 Brooke Ave, North York, ON M5M 2J6, Canada`
- date/time: 2026-09-30 12:00 PM–1:00 PM
- description preserves original intake title:
  `Jane Bisset 416 399-6519 62638 SO#585434 G3.5/G4`
- existing Calendar note preserved:
  `Wants G4 if possible`

No Striven Task mutation was performed as part of this title-format release.
