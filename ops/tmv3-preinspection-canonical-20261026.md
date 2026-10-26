# 2026-10-26 — PreInspection canonical execution and discovery verified

Live source **3.12.3-preinspection-intake-revalidation-r1** is verified at full-project hash `2fd9cb8c04f41678ae35a8f27d4db7c06201619c0c83b73da2c753baec345334`. [Release 40349322963](https://github.com/consultpramodh/classicfireplace/actions/runs/40349322963) passed. Exactly 00_Config, 60_Automation and 80_MorningOps changed in V3; all other live source was preserved. Existing live 90_Admin operator controls are archived to close prior repository drift, without changing their production source.

Two authorized event transactions completed: Task 19409 created; existing Task 19396 name corrected. Fresh independent checks on the final release return NO_CHANGE with no blockers for both, including Customer, owned Location, Requested By employee, assignments, canonical Task/Calendar names, canonical v1 schedule and no attached Order. Required calendar-copy parity was read back during each repair. No notifications were sent by either repair. Previous titles and authored notes were preserved.

The three dedicated 08:00/13:00/17:00 Toronto handlers and continuation share the canonical worker. Exactly one of each handler is installed; retired five-minute handler absent. Twelve competing legacy PreInspection entrypoints were retired in three legacy modules. Full legacy source hash `299542cec9df73618675ff2d11b3179e18e725954f7c1bcbc892d18cada4b144` independently matched after final release. Read-only legacy API trigger inventory was unavailable because there was no unique executable deployment; no deployment/access settings were expanded to obtain it. Retirement is enforced in source, not inferred from missing legacy triggers.

Missed-visit discovery scans Stephen's calendar without Striven reads or business writes. Explicit source instructions enter the existing guarded intake process; no Task mutation until the authoritative CF copy exists. Excluded creators: Stephen/Jay/Trevor/Pramodh/Thang; attendee presence alone never excludes an event. Unknown visits remain REVIEW, and explicit Not preinspect suppresses discovery. Queued recoveries reapply that gate; intent, creator and fingerprint are re-read immediately before any intake guest write. YES/NO email experiment remains parked.

Five unclassified visits are published in Morning Ops, separately from today's attention count. The exact Sheet projection and completion timestamp were read back. Today's snapshot has 20 appointments, 20 mapped and 2 operating attention items; discovery review count is 5. This is not an overall assertion that every vertical exception is resolved.

Validation: 461 regression cases on the actual full live-source candidate; 12 separate legacy retirement guards; syntax validation for both projects; exact PRE/POST hashes; native health ready; final independent event plans. Measured V3 API counter 247 before initial diagnosis and 300 at completion; no quota reset. First repair run 40347508602 ended on a later source GET HTTP 503 after both repairs and independent Task checks succeeded. Final release safely re-read state and did not replay mutations; GET-only 503 retries are bounded.

Immutable deployment/access settings preserved; native triggers execute current HEAD. A naturally scheduled next-slot run was not observed during this session. PRE backups and full runtime evidence are retained as workflow artifacts. Rollback: final V3 pre-source hash `a177dbb75040c0485801950285d9597f78c3ae05f335eec66e26fa7cb5827fb0`; initial pre-repair V3 `b24458af54c9282f2332163eb5fdcffab552899726cf12778fa9448f01b18b0e`. Do not blindly undo business writes or recreate either repaired Task.

Next action: confirm visit type for the five discovery rows by marking source titles Preinspect or Not preinspect; ordinary scheduled intake then handles confirmed appointments. Observe the next natural scheduled slot before claiming unattended-run acceptance.

---

