# TM V3 — Canonical PM Schedule Verification

**Date:** 2026-09-25 (America/Toronto)  
**Status:** VERIFIED  
**V3 engine:** `3.11.8-v1-canonical-schedule-r1`  
**GitHub Actions run:** `36180539726`  
**Artifact:** `10884600388`

## Scope

Read-only verification of the V3 canonical Task schedule fallback for Install Task `18678`.

No Striven business write or Google Calendar business write was authorized or executed.

## Verified evidence

- Calendar start: `2026-10-01 14:00 America/Toronto`
- Calendar end: `2026-10-01 17:00 America/Toronto`
- Striven v2 Task start exposed: `2026-10-01 02:00 -04:00`
- Striven v2 Task due exposed: `2026-10-01 05:00 -04:00`
- Canonical Striven v1 DesiredStartDate: `2026-10-01 14:00`
- Canonical Striven v1 DesiredEndDate: `2026-10-01 17:00`
- V3 schedule source: `V1_DESIRED_START_END`
- Start check: `MATCH`
- End check: `MATCH`
- Canonical read: `VERIFIED`
- Step 7 no longer requests a date patch.
- Current remaining Step 7 plan for this case: `PATCH_ASSIGNMENTS`.
- Write gate remained `SHADOW_ONLY__NO_WRITES`.
- Source head hash parity after temporary execution: verified.
- Temporary verification deployment: deleted.

## Conclusion

The PM schedule verification defect is resolved. V3 correctly rejects the misleading v2 PM representation and falls back to the canonical v1 Task schedule before making a date decision.

The remaining assignment mismatch is a separate issue and was not mutated as part of this verification.
