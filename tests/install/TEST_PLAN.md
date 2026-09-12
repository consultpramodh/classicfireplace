# Install TEST Plan

Use the Install contract in `docs/workflows/install/` and the shared process contract matrix as acceptance criteria.

Minimum regression cases before production promotion when Install or shared code is affected:

1. exact Sales Order resolves the intended customer/location/task;
2. customer-only evidence does not authorize unsafe mutation;
3. exactly one valid OPEN Install task is reused/reconciled;
4. multiple plausible task matches produce `REVIEW_REQUIRED`;
5. no-change case produces `NO_CHANGE_VERIFIED`;
6. date/relationship PATCH changes only differing fields and reads back correctly;
7. recovery CREATE/RECREATE rechecks for an OPEN duplicate immediately before write;
8. Location/Contact/SO ownership mismatch blocks mutation;
9. completed-today wait case produces `DEFERRED_RETRY` where that policy applies;
10. managed Install Calendar Task link is idempotent and preserves authored text;
11. valid link repair does not fail merely because the related task is completed when relationship proof is exact;
12. TEST environment rejects production Calendar/spreadsheet targets and non-allowlisted Striven writes.

A transport success without required read-back is not a PASS.