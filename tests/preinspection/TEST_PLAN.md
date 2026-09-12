# PreInspection TEST Plan

Use the PreInspection contract in `docs/workflows/preinspection/` and the shared process contract matrix as acceptance criteria.

Minimum regression cases before production promotion when PreInspection or shared code is affected:

1. Customer Number resolves one customer package when present;
2. exact Sales Order may support customer resolution but is not pushed merely because a task is created;
3. normalized phone and address resolution fail closed on ambiguity;
4. exactly one OPEN Task Type 105 is reused/reconciled;
5. no valid OPEN task may create one only after duplicate prevention and relationship checks;
6. multiple valid OPEN tasks produce `REVIEW_REQUIRED`;
7. Requested By uses exact Calendar organizer email -> exactly one Striven Employee -> `Type: employee`;
8. organizer missing/zero/multiple employee matches produce REVIEW with no customer-contact fallback;
9. Pool 8 assignment remains correct;
10. Calendar notes populate only Custom Field 854;
11. Task Description is blank on create and not overwritten with Calendar notes;
12. technician-completed fields are not prefilled;
13. dates/time reconcile to Calendar and read back correctly;
14. managed PreInspection Calendar Task link is idempotent and verified;
15. DONE with no final SO produces deferred awaiting-final-SO behavior;
16. DONE + unique final SO + unique same-customer Install target plans the downstream handoff safely;
17. zero Install target defers; multiple/mismatch requires review;
18. completed PreInspection link is appended under the Install Task link without destroying authored text;
19. repeated handoff does not duplicate the PreInspection link;
20. TEST environment rejects production Calendar/spreadsheet targets and non-allowlisted Striven writes.

Where new-location creation is tested, the customer must already be uniquely verified and the created Location must read back as owned by that customer.