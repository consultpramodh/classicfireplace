# Service TEST Plan

Use the Service contract in `docs/workflows/service/` and the shared process contract matrix as acceptance criteria.

Minimum regression cases before production promotion when Service or shared code is affected:

1. one Calendar event with one Service task resolves correctly;
2. one Calendar event with multiple fireplace tasks resolves the complete expected task set;
3. missing/duplicate/ambiguous task-set members produce review/block rather than guessing;
4. READY/Push-eligible OPEN task date changes patch only actual differences;
5. technician resolution is exact before assignment mutation;
6. Chris resolves to Employee 39;
7. Travis resolves to Employee 38;
8. Matt/Matthew resolves to Employee 26;
9. To Be Assigned preserves Pool 4 when appropriate;
10. assignment warnings/errors affect endpoint status when assignment was required;
11. recent successful push fingerprint suppresses unnecessary duplicate re-push where applicable;
12. all expected Service task links for one event are aggregated before one Calendar write;
13. later task processing cannot overwrite an earlier task link for the same event;
14. Calendar read-back verifies the full expected link set;
15. TEST environment rejects production Calendar/spreadsheet targets and non-allowlisted Striven writes.

`VERIFIED_COMPLETE` is event-level: all expected tasks, dates, technician state, and managed links must be correct.