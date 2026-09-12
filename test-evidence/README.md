# Task Mapping TEST Evidence

Store durable, non-sensitive evidence from TEST runs here.

Each test-run record should identify:

- candidate version or Git commit;
- environment = TEST;
- source snapshot/hash when available;
- workflow(s) affected;
- changed files;
- test cases executed;
- expected results;
- actual results;
- material write/read-back results;
- PASS / FAIL / REVIEW status;
- known untested production-only proofs;
- timestamp;
- operator/tool that executed the test when relevant.

Do not store credentials, Script Properties, OAuth tokens, customer PII, or unrestricted production payloads in this public repository.

A candidate is not production-ready merely because a TEST evidence file exists. The promotion gate in `docs/testing/TEST_ENVIRONMENT_PLAN.md` must be satisfied for the affected scope.