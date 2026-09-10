# Apps Script Source

This directory is reserved for the **exact verified current Apps Script source** from the final live POST/read-back snapshot.

## Current status

**NOT YET PRODUCTION-PARITY.**

Recent execution evidence proves the live bound Task Mapping project contains 36 files, but the exact current 36-file POST source is not accessible through the currently connected tools. The August source snapshot is older and does not contain the later PreInspect files, so it must not be copied here and mislabeled as current.

The repository is also public. Before a live snapshot is committed here it must be scanned for credentials, tokens, customer PII, and other private data.

## Completion criteria

This directory becomes authoritative only after:

1. fresh authenticated live pull;
2. exact file inventory captured;
3. sensitive-content scan passed/remediated;
4. source hashes recorded;
5. GitHub connector commit completed;
6. GitHub branch read-back confirms the source files and execution record;
7. `PROJECT_CURRENT_STATE.md` is updated to `GitHub source parity: VERIFIED`.
