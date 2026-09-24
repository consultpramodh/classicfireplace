#!/usr/bin/env node
'use strict';

const fs = require('fs');

const file = process.argv[2];
if (!file) {
  throw new Error('Usage: node tools/preinspect-explicit-number-fallback-patch.js <35_PreInspect_Task_Review.js>');
}

let source = fs.readFileSync(file, 'utf8');
const startMarker = '  // 1. Explicit Customer Number is authoritative.';
const endMarker = '\n\n  // 2. Malformed but common operator entry:';

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end < 0) {
  throw new Error('PreInspect explicit-customer resolver anchors missing.');
}

const replacement = [
  '  // 1. Explicit Customer Number is authoritative when it resolves.',
  '  // If the explicit number is not a Customer Number, treat the same number as',
  '  // a Sales Order candidate before falling through to the existing strong',
  '  // identity ladder. This prevents an SO entered in the title/Customer # slot',
  '  // from blocking a verified phone/address customer.',
  '  if (signals.customerNumber) {',
  '    const explicitNumber = signals.customerNumber;',
  '    const keys = preinspectCustomerRecordKeys_(',
  '      indexes.customers.byNumber[explicitNumber] || []',
  '    );',
  '',
  '    if (keys.length === 1) {',
  "      return preinspectConfirmCustomer_(keys[0], 'CUSTOMER_NUMBER_EXACT', signals, indexes);",
  '    }',
  '',
  '    if (keys.length > 1) {',
  '      return preinspectReviewCustomer_(',
  "        'CUSTOMER_NUMBER_DUPLICATE',",
  '        keys,',
  "        'Customer Number matched multiple customer rows.'",
  '      );',
  '    }',
  '',
  '    const explicitSoKeys = preinspectSOKeys_(explicitNumber, indexes);',
  '',
  '    if (explicitSoKeys.length === 1) {',
  '      const recoveredSignals = Object.assign({}, signals, {',
  "        customerNumber: '',",
  '        salesOrderNumber: signals.salesOrderNumber || explicitNumber',
  '      });',
  '      return preinspectConfirmCustomer_(',
  '        explicitSoKeys[0],',
  "        'EXPLICIT_NUMBER_AS_SALES_ORDER',",
  '        recoveredSignals,',
  '        indexes',
  '      );',
  '    }',
  '',
  '    if (explicitSoKeys.length > 1) {',
  '      return preinspectReviewCustomer_(',
  "        'EXPLICIT_NUMBER_SALES_ORDER_MULTIPLE_CUSTOMERS',",
  '        explicitSoKeys,',
  "        'Explicit number was not a Customer Number and resolves as a Sales Order to multiple customers.'",
  '      );',
  '    }',
  '',
  '    // The explicit number was neither a current Customer Number nor a uniquely',
  '    // resolvable Sales Order. Remove only that failed interpretation and let',
  '    // the established deterministic recovery ladder continue.',
  "    signals = Object.assign({}, signals, { customerNumber: '' });",
  '  }'
].join('\n');

source = source.slice(0, start) + replacement + source.slice(end);
fs.writeFileSync(file, source);
console.log('PREINSPECT_EXPLICIT_NUMBER_FALLBACK_PATCHED');
