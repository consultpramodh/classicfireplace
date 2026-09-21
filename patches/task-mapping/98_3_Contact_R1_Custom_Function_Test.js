/************************************************************
 * 98_3_Contact_R1_Custom_Function_Test.js
 *
 * Read-only spreadsheet runtime probe for Contact Resolution R1.
 * Intended for temporary/manual test formulas only.
 ************************************************************/
function TM_CONTACT_R1_LOOKUP(customerNumber, evidenceText) {
  const result = tmContactR1Resolve_({
    customerNumber: String(customerNumber === null || customerNumber === undefined ? '' : customerNumber).trim(),
    evidenceText: String(evidenceText === null || evidenceText === undefined ? '' : evidenceText)
  });
  return [
    result.status || '',
    result.contactId || '',
    result.matchType || '',
    result.candidateContactCount || 0
  ].join('|');
}
