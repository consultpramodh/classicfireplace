// JavaScript / Node.js: validate isolated deployment payloads without remote writes.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {patch,region,hash}=require('./tmv3-relationship-function-patch');
const manifest=JSON.parse(fs.readFileSync('release-candidates/tmv3-service-delivery-details-patch.json','utf8'));
let cases=0;
for(const spec of manifest.patches){
 const desired=fs.readFileSync(spec.payloadPath,'utf8');new vm.Script(desired);
 assert.equal(hash(desired),spec.expectedAfterFunctionSha256);cases++;
 const fixture='// preserve header\nfunction '+spec.functionName+'(){return "original";}\n\nfunction '+spec.nextFunctionName+'(){return "preserve";}';
 const input={files:[{name:spec.sourceFile,type:'SERVER_JS',source:fixture},{name:'00_Config',type:'SERVER_JS',source:'const preserve=true;'}]};
 const testSpec={...spec,expectedBeforeFunctionSha256:hash(region(fixture,spec).text)};
 const result=patch(input,desired,testSpec);
 assert.equal(region(result.content.files[0].source,spec).text,desired);cases++;
 assert.equal(result.content.files[1],input.files[1]);cases++;
 assert.equal(patch(result.content,desired,testSpec).alreadyPatched,true);cases++;
 assert.throws(()=>patch(input,desired,spec),/LIVE_FUNCTION_DRIFT/);cases++;
}
const workflow=fs.readFileSync('.github/workflows/tmv3-service-delivery-details-patch.yml','utf8');
assert.ok(workflow.indexOf('Preserve PRE source')<workflow.indexOf('Apply one function'));cases++;
assert.equal(manifest.patches.some(p=>p.sourceFile==='00_Config'),false);cases++;
console.log('PASS: '+cases+' scoped deployment, idempotence, drift and unchanged configuration checks.');
