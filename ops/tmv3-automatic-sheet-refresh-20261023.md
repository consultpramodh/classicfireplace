# Automatic Google Sheet refresh — 2026-10-23

Candidate 3.12.1-automatic-sheet-refresh-r1. User authorized automatic refresh of the existing CF Tasks V3 workbook.

Two-file change: 00_Config version and 60_Automation publication hooks/isolated timer. Service/Delivery/Install hourly runs publish the Sheet after their bounded batch. PreInspection manual/daily/continuation wrappers also request publication after processing. Runs over four minutes defer publication to the isolated hourly Sheet-refresh trigger; lock contention retains a pending flag. Existing scheduled mapping remains unchanged.

Publication uses current Calendar intake and local Striven caches through the existing read-only Stage 6 projection. It refreshes all four operator tabs and Morning Ops, verifies row counts, writes/readbacks a Toronto timestamp in Overview, and records audit evidence plus last-success/error/pending properties. It performs no Striven or Calendar business writes. Cached decisions are explicitly labeled as such; a Sheet refresh is not fresh external-field verification. Existing source refresh age limits and API budget are preserved.

Validation: 411 cases (185 core, 87 activation, 60 completed history, 27 evidence, 20 reminder, 32 publication). Repeated against actual live-source candidate before source apply. Native deployment acceptance passed; see outcome below. Expected exact pre-source hash 8c3b2fb3776a2b5d19391f65b7e04ddd68a1d90cc06e66d90daf3c35de34aeef. Full pre-source artifact and exact desired two-file hashes are preserved by the release workflow.

## Native verification completed

Run [40021982118](https://github.com/consultpramodh/classicfireplace/actions/runs/40021982118) passed. Full post-source hash `b24458af54c9282f2332163eb5fdcffab552899726cf12778fa9448f01b18b0e`; only 00_Config and 60_Automation changed; all other production source preserved. All 411 cases passed against the actual live-source candidate. Native Sheet publication completed 2026-10-23 16:50 Toronto with row-count verification: Install 50, Delivery 11, Service 197, PreInspection 14 (272 total). Morning Ops refreshed. Timestamp read back through native runtime and independent Sheets connector. Existing operator headings/wrap formatting remain present; visual validation was limited to native cell metadata.

19 triggers installed; exactly one hourly Sheet refresh; every prior stable handler retained. All four business scopes remain enabled; general AUTO/MANUAL remain false. Refresh pending=false and lastError=null. No Striven or Calendar business mutations were invoked by this release. Current Calendar is reread; Striven data comes from the local cache, including automation read-backs. Existing full-source refresh cadence remains unchanged.

Evidence: `executions/20261023-automatic-sheet-refresh.json`. Immutable deployment versions/access permissions unchanged. PRE backup artifact retained; rollback target is 3.12.0 source hash 8c3b2fb3776a2b5d19391f65b7e04ddd68a1d90cc06e66d90daf3c35de34aeef. An initial prepare-only attempt stopped on a byte-hash transport mismatch before source writes; corrected release succeeded.
