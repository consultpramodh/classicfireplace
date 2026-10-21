// JavaScript / Node.js: security and downstream credential compatibility checks.
'use strict';
const assert=require('node:assert/strict');
const {clientConfig,callbackCode,credential,SCOPES,CLIENT}=require('./tmv3-authorize-owner.cjs');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const c=clientConfig({installed:{client_id:CLIENT,client_secret:'test-only-secret'}});
assert.throws(()=>clientConfig({web:c}));
assert.throws(()=>clientConfig({installed:{...c,client_id:'wrong-project'}}));
assert.throws(()=>clientConfig({installed:{client_id:CLIENT}}));
assert.equal(callbackCode(new URL('http://127.0.0.1/oauth2callback?state=expected&code=test-code'),'expected'),'test-code');
for(const suffix of ['state=wrong&code=x','state=expected&error=access_denied','state=expected'])assert.throws(()=>callbackCode(new URL('http://127.0.0.1/oauth2callback?'+suffix),'expected'));
assert.throws(()=>callbackCode(new URL('http://127.0.0.1/wrong?state=expected&code=x'),'expected'));
assert.throws(()=>credential(c,{}));
const p=credential(c,{refresh_token:'test-only-refresh'});
assert.equal(profiles(p).length,1);
assert.deepEqual(profiles(p)[0],{client:CLIENT,secret:'test-only-secret',refresh:'test-only-refresh'});
assert.equal(new Set(SCOPES).size,SCOPES.length);
for(const s of ['spreadsheets','calendar','script.external_request','script.scriptapp','script.send_mail','script.projects','script.deployments'])assert(SCOPES.includes('https://www.googleapis.com/auth/'+s));
console.log('PASS: client identity, callback state/path/denial, offline-token requirement, single-profile downstream compatibility, required scopes.');
