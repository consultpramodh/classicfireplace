# CF Tasks V3 – Vertical File Split (STAGING ONLY)

## Source provenance

- Source input: `reconstructed-live-3.12.21.json` from the user's project Library.
- Claimed Apps Script project ID: `1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt`.
- Claimed version: `3.12.21-shared-preinspection-calendar-r1`.
- The input is a reconstructed snapshot. **It has not been authenticated against current live Apps Script HEAD or read-back-verified against the running project.**
- No Apps Script, trigger, Calendar, Striven, GitHub, or Sheet production changes were made when building this staging package.

## Staged files

| File | Purpose |
| --- | --- |
| `00_Configuration.gs` | Original configuration declarations |
| `10_Shared_Core.gs` | Existing generic and mixed-vertical functions, API access, reconciliation and core safeguards |
| `20_Master_Triggers.gs` | Explicit shared trigger coordination functions extracted mechanically |
| `30_PreInspection.gs` | 114 explicitly named Preinspection functions |
| `40_Installation.gs` | 24 explicitly named Installation functions |
| `50_Delivery.gs` | 7 explicitly named Delivery functions |
| `60_Service.gs` | 14 explicitly named Service functions |
| `90_Regression_Tests.gs` | Original regression code (not rewritten) |
| `appsscript.json` | Original reconstructed manifest |

## Mechanical verification performed

- The original reconstructed source contained **682 top-level function declarations**.
- The staged source contains exactly **682**, with no function additions, removals, hash changes, or duplicated function names.
- All eight staged scripts parsed successfully as JavaScript.
- Loading the staged scripts in a Node V8 VM without invoking real APIs succeeded.
- Six representative pure-function behavior comparisons against the reconstructed source matched, including Preinspection create policy, guest sync decisions, assignment planning, schedule and telephone formatting.

## Unresolved architecture work

This stage is **not the final fully isolated four-vertical architecture**. `10_Shared_Core.gs` still contains 108 functions referencing at least one vertical; 46 mention multiple verticals. They must be reviewed individually before extracting remaining business-specific branches. Two functions combining Service and Delivery were intentionally retained in Shared Core rather than guessing ownership.

The staged scripts are not verified against live Apps Script HEAD, Striven, or Calendar. **Do not import, deploy, or enable production writes from this package yet.**

## Required next steps

1. Export/read back the live bound Apps Script source and complete trigger inventory.
2. Verify hash and file parity with this reconstructed source; stop if the live code differs.
3. Restore/verify Calendar and email authorization under the actual trigger execution identity.
4. Untangle mixed-vertical code into explicit vertical policy modules while preserving single shared safety gates.
5. Run pure tests, mock integration tests, four-vertical regression tests, and real read-only verification.
6. Back up existing live source; stage a versioned GitHub branch and inspect the diff before deploying.
7. Deploy to the existing project only when parity and production safety have been demonstrated.

## Auth probe extension — 2026-11-09

- After the original 682-function structural split was deployed and verified, the read-only `tmv3_preInspectionAuthorizationCheck` function was appended to `30_PreInspection.gs` (current count: **683**).
- The original `migration-manifest.json` and `verification.json` remain immutable historical evidence for the initial 682-function / nine-file baseline. They intentionally do not describe this incremental diagnostic. The authorized release script verifies the new source is **exactly** the baseline plus the named probe.
- [Guarded diagnostic-only source release](https://github.com/consultpramodh/classicfireplace/actions/runs/42648009627) verified live Apps Script HEAD readback; none of the 682 existing function bodies changed; zero task, calendar, mail, trigger, or numbered-deployment writes.
- The diagnostic does not send any email. It checks the authoritative Calendar read, MailApp quota read, and current executing user's Preinspection triggers. **It must be run interactively in the Apps Script editor by the trigger owner to validate/authorize runtime scopes.**
