# TM2 Shadow R0 — Prepared, Not Deployed

**Date:** 2026-09-12 (America/Toronto)

## Status

`PREPARED_NOT_DEPLOYED`

A guarded same-ScriptID shadow package has been prepared for the Task Mapping project.

The package contains 19 `TM2_*.js` files. All public/private functions in those files use the `tm2_` prefix. Node syntax checks passed for all 19 files.

Initial safety state:

- mode = `SHADOW_READ_ONLY`;
- Striven writes disabled;
- Calendar writes disabled;
- CREATE/RECREATE disabled;
- TM2 trigger installation disabled;
- legacy menu/trigger routing untouched;
- direct TM2 Striven client disabled;
- initial source reads existing mapping projections only.

A guarded deployment utility was prepared to fresh-clone the current live Script ID, require the expected 36-file legacy baseline, create a local PRE backup, add only TM2 files, freshness-check immediately before push, push to the same Script ID, POST-clone, and verify that every legacy file hash is unchanged and every TM2 file matches. It attempts rollback to PRE source if post-push source verification fails after a push.

## Important limitation

The ChatGPT runtime used to prepare this package does not have the operator's Google/clasp authorization or a Google Apps Script source-write connector. Therefore the package has **not** been pushed to Apps Script from this session and no deployment/runtime verification is claimed.

## Package integrity

Prepared ZIP SHA-256:

`aad47943c9c70ed7b15c88afe66a767b2f4bffe78f345a7e0bc390a05fb0a3db`

## Required next proof

After the guarded deployment runs in the already-authorized operator environment, require:

1. `DEPLOYED_SHADOW_SOURCE_VERIFIED` from the deployment utility;
2. `tm2_connectivityAudit()` read-only PASS;
3. `tm2_diagnostics()` read-only PASS;
4. `tm2_shadowRunAll()` completes with zero write attempts;
5. no legacy file hash changes;
6. no menu/trigger rerouting.

Only then should TM2 business logic migration continue.
