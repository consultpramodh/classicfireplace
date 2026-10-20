// JavaScript / Node.js: pure deployment planning, with no network or Task writes.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const {patch,region,hash}=require('./tmv3-relationship-function-patch');
const manifest=JSON.parse(fs.readFileSync('release-candidates/tmv3-active-order-function-patch.json','utf8'));
let cases=0;
for(const spec of manifest.patches){
  const desired=fs.readFileSync(spec.payloadPath,'utf8');new vm.Script(desired);
  assert.equal(hash(desired),spec.expectedAfterFunctionSha256);cases++;
  const fixture='// unrelated header\nfunction '+spec.functionName+'(){return "before";}\n'+
    (spec.nextFunctionName?'\nfunction '+spec.nextFunctionName+'(){return "preserve";}':'');
  const content={files:[{name:spec.sourceFile,type:'SERVER_JS',source:fixture},{name:'00_Config',type:'SERVER_JS',source:'const untouched=false;'}]};
  const testSpec={...spec,expectedBeforeFunctionSha256:hash(region(fixture,spec).text)};
  const result=patch(content,desired,testSpec);
  assert.equal(region(result.content.files[0].source,spec).text,desired);cases++;
  assert.equal(result.content.files[1],content.files[1]);cases++;
  assert.equal(patch(result.content,desired,testSpec).alreadyPatched,true);cases++;
  assert.throws(()=>patch(content,desired,spec),/LIVE_FUNCTION_DRIFT/);cases++;
}
const worker=fs.readFileSync(manifest.patches[1].payloadPath,'utf8');
assert.ok(worker.includes('586061'));cases++;
assert.ok(worker.includes('tmv3_taskFirstFreshOrderOwnershipById_(id,liveCustomerId,title)'));cases++;
assert.ok(worker.includes('Math.max(60,'));cases++;
assert.ok(worker.includes("locationId:''"));cases++;
console.log('PASS: '+cases+' active-order deployment isolation and native-worker limits checks.');
