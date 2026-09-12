# TM2 Shadow R0.2 — One-Click Test Evidence Logging

**Date:** 2026-09-12 (America/Toronto)

## Status

`DEPLOYED_SHADOW_SOURCE_VERIFIED`

GitHub Actions run `34710979559` successfully deployed the TM2 shadow update and POST-verified the source.

## Change

TM2 now supports a one-click read-only test function:

`tm2_testSuite()`

That function runs:

1. `tm2_connectivityAudit()`
2. `tm2_diagnostics()`
3. `tm2_shadowRunAll()`

`tm2_shadowRunAll()` runs Install, Delivery, Service, and PreInspection shadow workflows.

## Automated evidence capture

Each public TM2 test function records a compact sanitized result in a hidden sheet named:

`TM2 Test Log`

The sheet is created automatically on the first TM2 test run. It records only compact test metadata such as function/workflow, mode, execution status, rows inspected, endpoint counts, business write attempts, cutover flags, sheet-presence diagnostics, capability summaries, and sanitized errors.

The evidence logger redacts email-shaped values and long numeric sequences from free-text detail/error fields. It does not store full shadow plans, customer identities, phone numbers, addresses, task payloads, or Calendar notes.

## Safety state

- TM2 mode remains `SHADOW_READ_ONLY`.
- Striven writes remain disabled.
- Calendar writes remain disabled.
- CREATE/RECREATE remains disabled.
- TM2 trigger installation remains disabled.
- all workflow cutover flags remain false.
- the only intentional write added by this release is the diagnostic evidence row in the hidden `TM2 Test Log` sheet.

## AutoPatch verification

- AutoPatch workflow run: `34710979559`
- conclusion: SUCCESS
- POST clone file count: 55
- legacy non-TM2 files: 36
- TM2 files: 19
- legacy source preservation: PASS
- candidate source read-back: PASS
- rollback required: NO
- final marker: `DEPLOYED_SHADOW_SOURCE_VERIFIED`

## Operator flow

The operator now needs to run only `tm2_testSuite()` from Apps Script. After the run, ChatGPT can read the hidden `TM2 Test Log` sheet through the connected Google Drive/Sheets integration and analyze the latest test rows without manual log pasting.
