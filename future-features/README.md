# Future Features

## Preinspection email YES/NO classification

**Status: PARKED — 2026-10-26. Not production ready.**

Feature branch: `future-features/preinspection-email-classification`, based on `task_mapping` in `consultpramodh/classicfireplace`.

### Requested behaviour

Ask the verified creator whether a likely appointment is a Preinspection. YES/NO must record in one click inside the email, with no browser redirect or second confirmation. A future verified YES may hand off to the canonical V3 Preinspection engine, preserving identity, customer-owned Location, task history, duplicate checks and read-back. NO suppresses classification requests for that event. No response remains pending.

Creator exclusions requested in this session: Stephen, Jay Scott, Trevor Burke and Pramodh. Do not confuse Steve with Stephen; confirm exact identities from authoritative data. Creator metadata differed across physical Calendar copies in the audit; define a canonical original creator before production filtering. No changes to production exclusions are claimed.

### Prototype and evidence

- Separate Sites prototype: project `appgprj_6adf60a2989c81919cf6aa836f31703c`.
- Source commit: `dd606b8c638edb7f6ca7bfe1810cd4c3230aff54` in the Sites source repository (not a V3 commit).
- Saved version: `appgprj_6adf60a2989c81919cf6aa836f31703c~appgver_db3852d983288191be8df7de99b1e892`.
- Isolated Calendar event: `do2u3gjemi3tqljvsrj054ulas` on Pramodh's calendar, October 27, 2026, 09:00–09:30 America/Toronto. Fictional John Doe/address; no real customer or SO.
- Original static button mockup and later browser-confirmation page did not meet the final in-email-only requirement.
- AMP MIME email plus POST endpoint implemented; sender/CORS/token/expiry tests: 10 passed. AMP email template passed the official AMP4EMAIL validator.
- Hosted API QA: YES saved; repeated YES returned identical saved timestamp; conflicting NO returned 409; separate NO test saved. These were direct API tests, not Gmail clicks.
- Delivered message contained text/plain, text/x-amp-html and text/html; delivered AMP exactly matched sent AMP.
- Gmail desktop and phone failed to render our dynamic emails with INTERNAL_ERROR, including a minimal no-form/no-network diagnostic. TEST 3 explicitly displayed red fallback. Root cause remains UNKNOWN.
- User's Playground screenshot showed a delivered Hello AMP4EMAIL email without an error banner. Its plain text alone did not prove AMP rendering versus fallback. A differentiated AMP/fallback Playground comparison was not completed.
- Browser access to Sites/Playground was restricted by policy. No successful browser/Gmail end-to-end click test is claimed.
- NO production Preinspection trigger handoff, Calendar promotion, customer resolution, or Striven Task creation was implemented or executed by this prototype.

### Archived implementation

`preinspection-email-classification/prototype-source.json` contains exact path-to-source text for the bounded prototype pieces. It is reference code, not an installable Apps Script patch. It depends on Sites/Vinext, Cloudflare D1, Drizzle, hosting authentication and migrations. Do not copy its API handlers into V3 Apps Script.

Tokens and secret values are deliberately excluded. Runtime names: AMP_EMAIL_HASH, AMP_QA_YES_HASH, AMP_QA_NO_HASH, AMP_EXPIRES. Reissue fresh event-scoped, expiring tokens if resumed; do not reuse old test email credentials. Existing test rows are retained as evidence, not live business responses.

### Resume criteria

1. Prove AMP rendering with visibly different AMP and fallback content through Google's Playground; compare delivery headers and MIME with our sender.
2. Resolve rendering failure and test actual Gmail YES and NO submissions, error feedback, expiry and duplicate handling.
3. Confirm supported team email clients, sender authentication and Google's sender registration before team rollout.
4. Retain POST-only writes; GET/link scans must not record answers. Bind each token to recipient/event and expiry; do not treat possession as independently verified identity.
5. Integrate a scoped, durable handoff to the existing V3 engine only after separate acceptance. Real identity/Location ambiguity still goes to REVIEW.
6. Confirm canonical creator handling across Calendar copies, status visibility, no-response behaviour and failure alerts.

### References

- https://developers.google.com/workspace/gmail/ampemail/testing-dynamic-email
- https://developers.google.com/workspace/gmail/ampemail/authenticating-requests
- https://developers.google.com/workspace/gmail/ampemail/debugging-dynamic-email
- https://developers.google.com/workspace/gmail/ampemail/register
- https://amp.dev/documentation/guides-and-tutorials/learn/cors-in-email/
