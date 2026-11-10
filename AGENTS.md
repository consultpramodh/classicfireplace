# CF Tasks project instructions

## Apps Script version retention

For every CF Tasks V3 release or saved-version operation, read and follow `docs/policies/VERSIONING_AND_RELEASES.md`.

The user requires a maximum of five saved numbered Apps Script versions per project. Back up superseded versions to a durable approved destination, verify read-back and hashes, protect all deployment-referenced versions, delete eligible excess versions, and verify the final inventory. The current deployed release and deployment-pinned rollback versions count toward the five.

Do not create numbered versions for audits, unchanged source, retries, or individual-event executions. Do not claim automatic pruning is installed, or cleanup completed, without execution evidence. If supported deletion access or verified backups are unavailable, preserve production, stop further numbered-version creation, and state the blocker. Never invent a version-delete API or bypass access restrictions.

This five-version rule supersedes the earlier instruction to retain only one version. Preserve unrelated source, functions, interfaces, records, triggers, and deployment targets.

## Source-controlled V3 execution standards

**Single source of truth:** `TMV3_HARD_RULES` in
`apps-script/tmv3-vertical-split-staging/00_Configuration.gs`.
Read the entire GLOBAL and applicable vertical contract before any V3 agent
plan, code modification, Calendar/Striven write, format repair or review.
Consume the same contract used by title/link builders. Do not rely on
independent copied formatting instructions, previous chats, old templates
or different title/link conventions from another vertical.

`TMV3.VERTICALS` supplies runtime IDs, endpoints and calendars—not an
independent policy definition. If runtime code or the user request conflicts
with the canonical rule, **do not silently choose one**. Flag the rule ID,
explain the discrepancy, and block affected edits pending an explicit
decision. Known policy conflicts requiring review: PreInspection Requested By,
Field 854 and non-Stephen-owner Calendar guest participation. Preserve current
production behavior until these are explicitly resolved and tested.

Use only Stage 7 guarded mutation, exact customer-owned Location and
Order/Task relationships, safe duplicate/history rules, approved recipient
and notification template, minimal managed fields and post-write readback.
Preserve authored Calendar notes, photos, existing correct clickable link
blocks, manual assignments and separate vertical-specific link headings.
For unknown format/owner/visit/status, use REVIEW; never manufacture a value.

Policy changes must update `TMV3_HARD_RULES`, corresponding executable
functions and all four verticals' regression tests together. A standards
object by itself is not a runtime enforcement guarantee. Only a successful
guarded Apps Script release and real business readback qualify as deployed.
