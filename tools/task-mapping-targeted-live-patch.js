#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const manifestPath=process.argv[2];
if(!manifestPath) throw new Error('Usage: node tools/task-mapping-targeted-live-patch.js <manifest.json>');
const repoRoot=process.cwd();
const m=JSON.parse(fs.readFileSync(path.resolve(repoRoot,manifestPath),'utf8'));
const scriptId=String(m.scriptId||'').trim();
const claspVersion=String(m.claspVersion||'3.3.0');
const expectedPreFileCount=Number(m.expectedPreFileCount||0);
if(!scriptId||!expectedPreFileCount) throw new Error('Manifest requires scriptId and expectedPreFileCount.');
function run(c,a,cwd){const r=cp.spawnSync(c,a,{cwd,env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.status!==0)throw new Error(c+' '+a.join(' ')+' failed with exit '+r.status);return r.stdout||'';}
function clasp(a,cwd){return run('npx',['-y','@google/clasp@'+claspVersion].concat(a),cwd);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function files(d){return fs.readdirSync(d,{withFileTypes:true}).filter(e=>e.isFile()).map(e=>e.name).sort();}
function hashes(d,n){const o={};n.forEach(x=>o[x]=sha(path.join(d,x)));return o;}
function copy(s,d){fs.cpSync(s,d,{recursive:true});}
function same(e,a,n,label){const bad=[];n.forEach(x=>{if(e[x]!==a[x])bad.push(x)});if(bad.length)throw new Error(label+': hash mismatch '+bad.join(', '));}
function replaceOnce(text,before,after,label){const p=text.indexOf(before);if(p<0)throw new Error(label+': anchor not found');if(text.indexOf(before,p+before.length)>=0)throw new Error(label+': anchor not unique');return text.slice(0,p)+after+text.slice(p+before.length);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'task-mapping-targeted-patch-'));
const preRoot=path.join(tmp,'PRE'),freshRoot=path.join(tmp,'FRESH'),workRoot=path.join(tmp,'WORK'),postRoot=path.join(tmp,'POST');
[preRoot,freshRoot,workRoot,postRoot].forEach(d=>fs.mkdirSync(d,{recursive:true}));
const outDir=path.resolve(repoRoot,m.outputDirectory||'task-mapping-targeted-patch-output');fs.mkdirSync(outDir,{recursive:true});
const evidencePath=path.join(outDir,'evidence.json');
const evidence={schemaVersion:1,release:m.release||'UNNAMED_TARGETED_PATCH',scriptId:scriptId,startedAt:new Date().toISOString(),status:'STARTED'};
let pushed=false;
try{
 console.log('=== TARGETED PATCH 1/9 authorize ===');clasp(['show-authorized-user','--json'],repoRoot);
 console.log('=== TARGETED PATCH 2/9 PRE clone ===');clasp(['clone',scriptId,'--rootDir','src'],preRoot);
 const preSrc=path.join(preRoot,'src'),preNames=files(preSrc);if(preNames.length!==expectedPreFileCount)throw new Error('expected '+expectedPreFileCount+' PRE files, found '+preNames.length);
 const preHashes=hashes(preSrc,preNames);copy(preRoot,path.join(outDir,'PRE_SOURCE'));
 (m.requiredPreFiles||[]).forEach(n=>{if(!preNames.includes(n))throw new Error('PRE missing '+n)});
 (m.addFiles||[]).forEach(x=>{if(preNames.includes(x.targetFile))throw new Error('PRE already contains add target '+x.targetFile)});
 (m.preContains||[]).forEach(x=>{const t=fs.readFileSync(path.join(preSrc,x.file),'utf8');if(!t.includes(x.text))throw new Error('PRE '+x.file+' missing required marker: '+x.text)});
 console.log('=== TARGETED PATCH 3/9 build WORK ===');copy(preRoot,workRoot);const workSrc=path.join(workRoot,'src');
 const changed={};
 (m.replacements||[]).forEach((x,i)=>{const p=path.join(workSrc,x.file);let t=fs.readFileSync(p,'utf8');t=replaceOnce(t,x.before,x.after,(x.label||('replacement '+i))+' in '+x.file);fs.writeFileSync(p,t);changed[x.file]=true;});
 (m.addFiles||[]).forEach(x=>{const src=path.resolve(repoRoot,x.repoPath);if(!fs.existsSync(src))throw new Error('add source missing '+x.repoPath);fs.copyFileSync(src,path.join(workSrc,x.targetFile));changed[x.targetFile]=true;});
 const changedNames=Object.keys(changed).sort();changedNames.forEach(n=>run(process.execPath,['--check',path.join(workSrc,n)],repoRoot));
 (m.workContains||[]).forEach(x=>{const t=fs.readFileSync(path.join(workSrc,x.file),'utf8');if(!t.includes(x.text))throw new Error('WORK '+x.file+' missing: '+x.text)});
 const untouched=preNames.filter(n=>!changed[n]);same(preHashes,hashes(workSrc,untouched),untouched,'WORK untouched preservation');
 console.log('=== TARGETED PATCH 4/9 freshness clone ===');clasp(['clone',scriptId,'--rootDir','src'],freshRoot);const freshSrc=path.join(freshRoot,'src'),freshNames=files(freshSrc);if(JSON.stringify(freshNames)!==JSON.stringify(preNames))throw new Error('freshness file set changed');same(preHashes,hashes(freshSrc,preNames),preNames,'freshness guard');
 console.log('=== TARGETED PATCH 5/9 push ===');clasp(['push','--force'],workRoot);pushed=true;
 console.log('=== TARGETED PATCH 6/9 POST clone ===');clasp(['clone',scriptId,'--rootDir','src'],postRoot);const postSrc=path.join(postRoot,'src'),postNames=files(postSrc);const added=(m.addFiles||[]).map(x=>x.targetFile);const expectedPost=preNames.concat(added).sort();if(JSON.stringify(postNames)!==JSON.stringify(expectedPost))throw new Error('POST file set differs from expected');
 const postHashes=hashes(postSrc,postNames);same(preHashes,postHashes,untouched,'POST untouched preservation');
 console.log('=== TARGETED PATCH 7/9 verify changed hashes ===');const workHashes=hashes(workSrc,changedNames);same(workHashes,postHashes,changedNames,'POST changed-file verification');changedNames.forEach(n=>run(process.execPath,['--check',path.join(postSrc,n)],repoRoot));
 (m.postContains||[]).forEach(x=>{const t=fs.readFileSync(path.join(postSrc,x.file),'utf8');if(!t.includes(x.text))throw new Error('POST '+x.file+' missing: '+x.text)});
 console.log('=== TARGETED PATCH 8/9 record evidence ===');evidence.status='DEPLOYED_SOURCE_VERIFIED';evidence.completedAt=new Date().toISOString();evidence.preFileCount=preNames.length;evidence.postFileCount=postNames.length;evidence.changedFiles=changedNames;evidence.runtimeVerification=m.runtimeVerification||'PENDING';evidence.safety=m.safety||{};fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));
 console.log('=== TARGETED PATCH 9/9 complete ===');console.log('DEPLOYED_SOURCE_VERIFIED');
}catch(err){evidence.status='FAILED';evidence.failedAt=new Date().toISOString();evidence.error=String(err&&err.stack?err.stack:err);if(pushed){try{console.error('POST verification failed after push; rolling back PRE...');clasp(['push','--force'],preRoot);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}catch(rb){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(rb&&rb.stack?rb.stack:rb);}}else evidence.rollback='NOT_NEEDED_NO_PUSH_COMPLETED';fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2));throw err;}
