// JavaScript / Node.js: deployment isolation tests; no Google or Striven calls.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {patch,region,hash,canonical}=require('./tmv3-relationship-function-patch');
const manifest=JSON.parse(fs.readFileSync('release-candidates/tmv3-relationship-function-patch.json','utf8'));
const desired=fs.readFileSync('tools/tmv3-relationship-repair-function.js','utf8');
// Fixture has deliberate unrelated live drift; no wholesale source replacement.
const old='function tmv3_repairExistingTaskRelationships(){return "old";}\n';
const source='// live-only header\n'+old+'\nfunction tmv3_taskFirstFreshOrderOwnershipById_(){return "live-only";}\n';
const input={files:[{name:'58_Operations',type:'SERVER_JS',source},{name:'00_Config',type:'SERVER_JS',source:'const keep=false;'}]};
const m={...manifest,expectedBeforeFunctionSha256:hash(region(source).text)};
const out=patch(input,desired,m);
assert.equal(out.content.files[1],input.files[1]);
assert.ok(out.content.files[0].source.startsWith('// live-only header\n'));
assert.ok(out.content.files[0].source.endsWith('function tmv3_taskFirstFreshOrderOwnershipById_(){return "live-only";}\n'));
assert.equal(region(out.content.files[0].source).text,desired);
assert.equal(region(input.files[0].source).text,old);
assert.notEqual(canonical(input),canonical(out.content));
assert.equal(patch(out.content,desired,m).alreadyPatched,true);
assert.throws(()=>patch(input,desired,manifest),/LIVE_FUNCTION_DRIFT/);
assert.throws(()=>patch(input,desired+' ',m),/DESIRED_FUNCTION_HASH/);
assert.throws(()=>patch(input,desired,{...m,taskWritesRequested:true}),/TASK_EXECUTION_FORBIDDEN/);
assert.throws(()=>patch({files:input.files.concat(input.files[0])},desired,m),/NOT_UNIQUE/);
assert.throws(()=>region(source+'\n'+old),/BOUNDARY_NOT_UNIQUE/);
assert.throws(()=>region('no function'),/BOUNDARY_NOT_UNIQUE/);
const workflow=fs.readFileSync('.github/workflows/tmv3-relationship-function-patch.yml','utf8');
assert.ok(workflow.indexOf('Preserve PRE source')<workflow.indexOf('Apply one function'));
assert.ok(workflow.includes('if-no-files-found: error'));
console.log('PASS: 15 one-function patch, drift, idempotence, isolation and backup-order checks.');
