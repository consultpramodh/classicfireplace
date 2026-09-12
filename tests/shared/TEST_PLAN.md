# Shared Modules TEST Plan

This suite applies whenever cleanup changes a module used by more than one workflow.

Required shared regression areas include, as applicable:

1. environment resolver rejects invalid/missing configuration and production IDs in TEST;
2. Calendar source/normalization preserves Event IDs, timing, authored text, organizer and workflow-specific identifiers;
3. report/cache layer validates schema before cache replacement;
4. legitimate zero-row reports are distinguished from parser/schema failures;
5. last-known-good report data survives unexpected report shape/failure;
6. pagination termination/cap behavior is explicit and detectable;
7. relationship resolver proves SO->Customer, Location->Customer, Contact->Customer and exact Employee identity where required;
8. task matcher returns zero/one/multiple candidates deterministically and performs no writes;
9. planner produces CREATE/PATCH/RECREATE/REVIEW/NOTHING decisions without mutation;
10. executor refuses plans that fail relationship/freshness/environment guardrails;
11. duplicate prevention runs immediately before CREATE/RECREATE;
12. uncertain write state prevents blind CREATE retry;
13. recovery uses the same resolver/planner/executor contracts;
14. Calendar link service aggregates the complete expected link set and verifies read-back;
15. verification layer compares expected vs actual material state;
16. scheduler does not perform duplicate report refresh inside an approved freshness window;
17. orchestrator propagates child failures instead of reporting generic success;
18. compatibility/public entrypoints still resolve during migration;
19. Install, Delivery, Service and PreInspection targeted suites run for every workflow that calls the changed shared module.

Shared-module PASS requires caller coverage, not merely unit-level helper success.