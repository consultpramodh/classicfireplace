# Next-week PreInspection execution results — October 26–November 1, 2026

All eight owner-authorized events have completed verification. Frances Harvey was resolved on October 22 using the unique customer-owned location matching the calendar address as written.

| Event | Toronto schedule | Task | Final verified result |
|---|---|---|---|
| Spencer Kelly | October 26, 11 AM–noon | 19068 | Existing task; NO_CHANGE |
| Anne White | October 26, noon–1 PM | 19311 | Existing task; NO_CHANGE |
| Craig Dale | October 26, 1–2 PM | 19319 | Created, canonical schedule and links verified; NO_CHANGE |
| Frances Harvey | October 26, 3–4 PM | 19323 | Existing open task reconciled; customer 36935, location 46531, canonical schedule and both calendar links verified; NO_CHANGE |
| Bill Kelloway | October 28, 10–11 AM | 19313 | Existing task found and verified; NO_CHANGE |
| Sylvia Brudar | October 28, 1–2 PM | 19317 | Created, canonical schedule and links verified; NO_CHANGE |
| Robert Hansen | October 28, 2–3 PM | 19320 | Created on customer 43890, location 57805; NO_CHANGE |
| Alexandra Alousis | October 28, 5–6 PM | 19321 | Created on verified existing customer 62996; NO_CHANGE |

Frances: the owner instructed matching and using the calendar address. Fresh locations verified that 46531 uniquely matches the written address, 207 Eastwood Rd, Toronto, ON M4L 2E2, Canada. Location 56626 uses Eastwood Road and includes Old Toronto. Neither location was merged, deleted or reassigned. The PreInspection resolver now breaks broad address ties only when one same-customer location matches the written calendar address, ignoring formatting, Canadian postal spacing and a trailing country. Street words and unit information are preserved. Duplicate written matches remain blocked. Local tests covered unique match, duplicate matches, wrong ownership, unit mismatch and unchanged Service behavior. The production run found open task 19323 and reconciled its requested-by, task name, calendar titles and links. Final fresh readbacks verified customer 36935, location 46531, Requested By employee 23, employee 15 plus pool 8 assignment and canonical October 26 15:00–16:00 schedule. Both calendar copies retained the calendar address and linked task 19323. No notifications were sent.

Creator exclusions used original event creators, verified against the live employee directory: Trevor Burke, Stephen Foley, Pramodh Kumar, Jay Scott and Thang Tran. Steve Trevor is distinct from Trevor Burke and remained in scope. Calendar imports carry original-creator provenance. The existing 30_Calendar module verifies that provenance against the original same-UID source event before using it. Changed or mismatched creator evidence stops processing.

The 38_Step4_Identity change recognizes an exact full person name after c/o for PreInspection address corroboration. It does not broaden other verticals. Positive and negative cases were executed locally, followed by actual Robert task creation and field readbacks.

Alexandra was present in the fresh Striven customer report but missing from the cache. Her exact report name and phone identified customer 62996; one fresh customer-owned matching location was required before hydration and execution. No new customer was created.

V1 DesiredStartDate/DesiredEndDate supplied canonical schedule verification where V2 retained its AM/PM representation discrepancy. No guessed twelve-hour date shift was written.

The daily API budget was not reset for these next-week runs. Existing task lifecycle, duplicate-create and write-readback guards remained active. Temporary execution helpers were removed and the permanent two-module repair baseline was read back at SHA-256:
64a37d2cf96b9e9b51ad95e362f4a05b58424c061bc6c6daedf1028fbd089ac1

Evidence:
- Existing-event run: https://github.com/consultpramodh/classicfireplace/actions/runs/39672647249
- Sylvia creation / first blocked identity results: https://github.com/consultpramodh/classicfireplace/actions/runs/39674759136
- Independent eight-event diagnostic: https://github.com/consultpramodh/classicfireplace/actions/runs/39675775962
- Craig creation and final readbacks: https://github.com/consultpramodh/classicfireplace/actions/runs/39676798169
- Fresh identity/location evidence: https://github.com/consultpramodh/classicfireplace/actions/runs/39677196508
- Robert and Alexandra creation and final readbacks: https://github.com/consultpramodh/classicfireplace/actions/runs/39677850797

- Frances exact-address reconciliation and final readbacks: https://github.com/consultpramodh/classicfireplace/actions/runs/39791992712

These are verified execution-time results, not a guarantee that a separate legacy writer cannot subsequently change a task.
