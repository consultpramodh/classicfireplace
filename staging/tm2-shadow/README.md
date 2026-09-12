# TM2 Shadow Source Staging

This folder contains the R0 shadow-migration source set. It is intentionally non-authoritative until it has been deployed to the live Script ID and post-read-back verified.

Safety:
- every file starts `TM2_`;
- every function starts `tm2_`;
- write, create/recreate, Calendar mutation, trigger installation, and direct Striven client paths are disabled in R0;
- existing legacy files remain untouched;
- `tools/deploy-tm2-shadow.ps1` fresh-clones the live Apps Script project, backs it up, adds only these files, verifies legacy hashes, pushes, post-clones, and verifies source parity.
