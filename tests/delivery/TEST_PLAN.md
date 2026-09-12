# Delivery TEST Plan

Use the Delivery contract in `docs/workflows/delivery/` and the shared process contract matrix as acceptance criteria.

Minimum regression cases before production promotion when Delivery or shared code is affected:

1. Delivery task/SO/customer/location evidence resolves uniquely;
2. ambiguous customer/address/location evidence produces `REVIEW_REQUIRED`;
3. normal PATCH requires a safe eligible OPEN task and complete Calendar timing;
4. relationship updates prove SO/Location/Requested By ownership before mutation;
5. To Be Assigned preserves Pool 4 when no valid employee assignment exists;
6. John Hoang resolves to Employee 18;
7. Matthew Thompson resolves to Employee 26;
8. unconfigured/unproven employee names are not guessed;
9. assignment helper/write failure when assignment is required produces `PARTIAL_FAILURE` rather than success;
10. duplicate prevention runs immediately before CREATE/RECREATE where recovery applies;
11. Calendar managed SO/Task links preserve authored text, remain idempotent, and read back correctly;
12. TEST environment rejects production Calendar/spreadsheet targets and non-allowlisted Striven writes.

`VERIFIED_COMPLETE` requires all applicable dates, relationships, assignment, and managed links to be verified.