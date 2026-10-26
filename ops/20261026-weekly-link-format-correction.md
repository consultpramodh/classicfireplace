# Weekly repair: link-format correction

The October 26–November 1 Install/Delivery/Service repair invoked a shared non-PreInspection writer that generated generic Markdown blocks and numeric Task labels. Task/ID read-back did not establish correct Calendar presentation. Bulk repair orchestration was stopped after the user flagged the format regression.

Live correction source hash: `b689f4d8eacd3fe86e1ca6dfbd513edfc1b48bed9644a1a5de1122a8066e695d`. Independently matched the uploaded PRE candidate and the live project. Changed modules: 35_CalendarLinks, 58_Operations, 60_Automation. Existing PreInspection formatting path retained. No numbered versions created or deployment access changed.

Correction preserves valid existing vertical blocks, renders clickable HTML when repair is needed, restores Install/Delivery-specific headings and supplies real Task names. Targeted format repair permits only VERIFY_CALENDAR_LINKS through the canonical Stage 7 executor; records requiring other changes remain held.

Validation: exact-live-source layout checks, weekly date/scope checks, 185 core regression cases and 27 evidence/schema/ownership cases passed before source push. Source and health were read back. Two initial restoration transactions were independently present in the native audit at 16:56 and 16:58 Toronto. Full restoration was still running when this checkpoint was written; do not claim all events fixed.

Restoration run: https://github.com/consultpramodh/classicfireplace/actions/runs/40399614654

The continuation controller waits for successful restoration, checks the exact corrected source hash, then independently reads affected Calendar descriptions and requires the correct heading and clickable named Task anchors before resuming remaining weekly queues. It performs no source pushes. All original ownership, lifecycle, duplicate and uncertain-write guards remain active. Final results are archived as workflow artifacts and the operator views are republished after processing.

Install's initial weekly sweep: 12 rows scanned, 8 verified (including 2 already fulfilled), 3 review and 1 uncertain. Five event title/name corrections and one existing-state/link verification succeeded. Delivery had begun; Service was not yet processed by this repair session at the format stop. Existing unresolved records are not completion claims.

Next action: finish and independently verify format restoration, then let the gated continuation process the remaining weekly queues. Review holds require source evidence, never guessed identities or blind retries.
