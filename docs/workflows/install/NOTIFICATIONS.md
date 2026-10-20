# Install missing-SO reminders — prepared, not deployed

The existing V3 reminder now uses its own `installRemindersEnabled` flag, independent of task/calendar write stage. It reads Calendar and sends email only; it does not resolve orders, change tasks, or alter Calendar. Existing daily trigger definition remains around 11 AM in the project timezone; actual trigger installation and timezone require live verification.

Eligibility: weekdays, today through three weekdays ahead, no detected SO number or order ID, eligible Install event under the existing Calendar parser. This is a missing-reference reminder, not an unresolved-order alert. Existing calendar scope is unchanged. Public holidays are not excluded by the weekday calculation.

Recipients are only exact `classicfireplace.ca` event creators. Guests, description emails and external creators are excluded. Missing internal creator is audited without sending. Successful delivery is marked once per event per day; a script lock prevents overlapping sends. Mail transport acknowledgement is not proof of inbox delivery.

Menu/editor preview: `tmv3_previewInstallMissingSoReminders`; returns candidate recipients, subject and body without sending, marking or auditing. Send-now entrypoint remains `tmv3_sendInstallMissingSoRemindersNow`.

Validation: 30 dedicated checks; existing 185 hardening cases, PreInspection suites and 81 Install readiness cases passed locally.

Release gate: pull and back up live bound source, compare to repository baseline, apply only intended changes, run pre-push checks, deploy to same project, re-pull/hash, preview exact recipients, then test delivery and confirm the existing trigger. Live access is currently policy-blocked. No live email or production changes were performed.

## Dynamic email presentation

Uses the checked PreInspection email layout: 760px fluid container, dark header/red accent, one appointment card, dynamic issue list and current-versus-required comparison rows, optional authored notes, Calendar action button and footer. HTML-escapes Calendar content and excludes unsafe action links. PreInspection rendering and policy remain unchanged.

Install events without both a location and a title phone are flagged for purpose confirmation, not asserted to be customer installations. SO/address instructions are conditional in that message. This is a conservative review cue, not verified classification.

Successful reminder sends increment an Install-specific event counter for `FOLLOW-UP #N` subject/header labels. Existing once-per-day eligibility still applies. Old reminder history is not reconstructed; numbering begins with this revision. The pure renderer supports test-only output addressed to Pramodh without delivery or production-history writes.
