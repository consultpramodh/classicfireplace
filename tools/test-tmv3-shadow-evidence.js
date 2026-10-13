// JavaScript: verify the runner's actual evidence projection without live APIs.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, 'tmv3-shadow-run.js'), 'utf8');
const start = source.lastIndexOf('          step1:');
const end = source.indexOf('          sourceHeadHashVerified:', start);
assert.ok(start >= 0 && end > start);
const expression = source.slice(start + '          step1:'.length, end).trim().replace(/,$/, '');
function project(mode, response) {
  return vm.runInNewContext(expression, {RUN_MODE:mode, step1:response});
}
const noChange = {ok:true, status:'NO_CHANGE_VERIFIED', taskId:19081,
  checks:{customer:true}, writesPerformed:false};
assert.equal(project('TASK_FIRST_NO_CHANGE', noChange), noChange);
assert.equal(project('TASK_FIRST_NO_CHANGE', {ok:false,status:'REVIEW_MISMATCH'}).status, 'REVIEW_MISMATCH');
for (const mode of ['TASK_FIRST_AUDIT','TASK_FIRST_CONTACT_PROBE','TASK_FIRST_ORDER_PROBE']) {
  const response = {ok:true,status:'PROBED',result:{status:'AUDIT_ONLY'}};
  assert.equal(project(mode, response), response);
}
const inner = {status:'CALENDAR_OK'};
assert.equal(project('FULL', {result:inner}), inner);
assert.equal(project('LIVE_HARDENING_REGRESSION', noChange), noChange);
assert.equal(project('CANARY_TASK_FIRST_19083', {result:inner}), inner);
console.log('Shadow evidence projection PASS: 8 assertions; no live calls.');
