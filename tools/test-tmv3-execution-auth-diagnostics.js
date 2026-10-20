// JavaScript / Node.js: offline OAuth scope and diagnostic isolation checks.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('tools/tmv3-shadow-run.js','utf8');
const fn=source.slice(source.indexOf('function executionScopeAssessment('),source.indexOf('async function getContent()'));
const c={Set,String,Array,Error};vm.runInNewContext(fn,c);
assert.equal(c.executionScopeAssessment(['a','b'],'a b').scopeCoverage,'COMPLETE');
assert.equal(c.executionScopeAssessment(['a','b'],'a').missingScopes.join(','),'b');
assert.equal(c.executionScopeAssessment(['a'],'').scopeCoverage,'MISSING_SCOPES');
assert.equal(c.executionScopeAssessment(['a','a'],'a a').requiredScopes.length,1);
assert.equal(c.executionScopeAssessment(['a'],' a \n b ').grantedScopeCount,2);
assert.equal(c.executionScopeAssessment(['a'],'A').scopeCoverage,'MISSING_SCOPES');
for(const v of [undefined,[],[''],[7]])assert.throws(()=>c.executionScopeAssessment(v,'a'));
const mode=source.slice(source.indexOf("  if (RUN_MODE === 'EXECUTION_AUTH_DIAGNOSTICS')"),source.indexOf("  if (RUN_MODE === 'EXECUTION_HEALTH')"));
for(const forbidden of ['updateContent(', 'runScriptFunction(', 'createDeployment(', 'deleteDeployment('])assert.equal(mode.includes(forbidden),false);
assert.ok(mode.includes("method:'POST'"));assert.ok(mode.includes("redirect:'error'"));
assert.equal(/console\.log\(.*(?:tokenInfo|accessToken|clientId|raw)/.test(mode),false);
console.log('PASS: 10 scope cases; diagnostic mode has no execution/source/deployment writes and does not log raw credentials.');
