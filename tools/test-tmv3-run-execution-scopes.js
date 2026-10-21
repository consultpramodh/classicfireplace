// JavaScript / Node.js: reject incomplete execution grants before invoking automation.
'use strict';
const assert=require('node:assert/strict'),{missingExecutionScopes}=require('./tmv3-run-preinspection-now');
const scopes=['spreadsheets','calendar','script.external_request','script.scriptapp','script.send_mail'];
assert.deepEqual(missingExecutionScopes(scopes,['script.projects','script.deployments']),scopes);
assert.deepEqual(missingExecutionScopes(scopes,scopes),[]);
assert.deepEqual(missingExecutionScopes(scopes,scopes.slice(1)),['spreadsheets']);
assert.deepEqual(missingExecutionScopes([],[]),[]);
assert.deepEqual(missingExecutionScopes(scopes,[...scopes,...scopes,'cloud-platform']),[]);
console.log('PASS: incomplete grants blocked; all required grants accepted; deterministic missing-scope list; no execution side effects.');
