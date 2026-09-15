#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const SID='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
const CV='3.3.0';
const RELEASE='R5_2_PREINSPECT_ASSIGNMENT_AND_FIELD854_20260915';
const TARGET='35_PreInspect_Task_Review.js';
const EXPECTED_PRE_SHA='4b207966e629364974d058ff93059f45e7d8a84beedf29f3e54292b973235593';
const OUT=path.resolve('task-mapping-preinspect-r5-2-output'); fs.mkdirSync(OUT,{recursive:true});
const evidence={release:RELEASE,status:'STARTED',scriptId:SID,targetFile:TARGET,startedAt:new Date().toISOString()};
function run(cmd,args,cwd){const r=cp.spawnSync(cmd,args,{cwd:cwd||process.cwd(),env:process.env,encoding:'utf8',stdio:['ignore','pipe','pipe']});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed ${r.status}`);return r.stdout||'';}
function clasp(args,cwd){return run('npx',['-y',`@google/clasp@${CV}`,...args],cwd);}
function sha(f){return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');}
function files(d){return fs.readdirSync(d,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();}
function hashes(d,ns){const o={};ns.forEach(n=>o[n]=sha(path.join(d,n)));return o;}
function same(e,a,ns,label){const bad=ns.filter(n=>e[n]!==a[n]);if(bad.length)throw new Error(`${label}: hash mismatch ${bad.join(', ')}`);}
function fr(s,n){const re=new RegExp(`function\\s+${n}\\s*\\(`,'g'),m=[...s.matchAll(re)];if(m.length!==1)throw new Error(`Expected one ${n}; found ${m.length}`);let i=s.indexOf('{',m[0].index+m[0][0].length),d=0,q=null,esc=false,lc=false,bc=false;for(let j=i;j<s.length;j++){const c=s[j],nx=s[j+1];if(lc){if(c==='\n')lc=false;continue;}if(bc){if(c==='*'&&nx==='/'){bc=false;j++;}continue;}if(q){if(esc){esc=false;continue;}if(c==='\\'){esc=true;continue;}if(c===q)q=null;continue;}if(c==='/'&&nx==='/'){lc=true;j++;continue;}if(c==='/'&&nx==='*'){bc=true;j++;continue;}if(c==='\''||c==='"'||c==='`'){q=c;continue;}if(c==='{')d++;else if(c==='}'&&!--d)return{a:m[0].index,b:j+1,t:s.slice(m[0].index,j+1)};}throw new Error('No close for '+n);}
function rep(s,n,r){const x=fr(s,n);return s.slice(0,x.a)+r.trim()+s.slice(x.b);}

const {NEW_ASSIGNEES,NEW_FIELD854}=require('./preinspect-r5-2-patch.js');

const root=fs.mkdtempSync(path.join(os.tmpdir(),'tm-r52-')),P=path.join(root,'PRE'),W=path.join(root,'WORK'),F=path.join(root,'FRESH'),O=path.join(root,'POST');[P,W,F,O].forEach(d=>fs.mkdirSync(d,{recursive:true}));let pushed=false;
try{
  console.log('R5.2 authorize'); clasp(['show-authorized-user','--json']);
  console.log('R5.2 PRE'); clasp(['clone',SID,'--rootDir','src'],P); const ps=path.join(P,'src'),ns=files(ps); if(ns.length!==59)throw new Error('Expected 59 files, found '+ns.length); const tp=path.join(ps,TARGET); if(!fs.existsSync(tp))throw new Error('Missing '+TARGET); if(sha(tp)!==EXPECTED_PRE_SHA)throw new Error('Unexpected live '+TARGET+' hash: '+sha(tp)); const ph=hashes(ps,ns); fs.cpSync(P,path.join(OUT,'PRE_SOURCE'),{recursive:true});
  let pre=fs.readFileSync(tp,'utf8'); ['preinspectR47EnsureInstallNotesCanonical_','preinspectR30PushAssignees_','preinspectR46GetCanonicalV1Schedule_','preinspectR48CaptureField854Contract_'].forEach(m=>{if(!pre.includes(m))throw new Error('Missing expected marker '+m);});
  console.log('R5.2 patch'); fs.cpSync(P,W,{recursive:true}); const ws=path.join(W,'src'),wp=path.join(ws,TARGET); let s=fs.readFileSync(wp,'utf8'); s=rep(s,'preinspectR30PushAssignees_',NEW_ASSIGNEES); s=rep(s,'preinspectR47EnsureInstallNotesCanonical_',NEW_FIELD854); fs.writeFileSync(wp,s); run(process.execPath,['--check',wp]);
  const ass=fr(s,'preinspectR30PushAssignees_').t, f854=fr(s,'preinspectR47EnsureInstallNotesCanonical_').t;
  ['ASSIGNEES_REMOVE_LEGACY_EMPLOYEE_','remaining legacy employees','POOL_8_PLUS_REMOVE_ONLY_LEGACY_TEMPLATE_EMPLOYEES_6_20'].forEach(x=>{if(!ass.includes(x))throw new Error('Assignee regression marker missing '+x);});
  ['RECONCILED_PRIOR_UNCERTAIN_V2_MATCH','V2_TASK_INFOCUSTOMFIELDS','No second write attempted','preinspectR345bFindInfoCustomFields_'].forEach(x=>{if(!f854.includes(x))throw new Error('Field854 regression marker missing '+x);});
  const wh=hashes(ws,ns),chg=ns.filter(n=>ph[n]!==wh[n]); if(JSON.stringify(chg)!==JSON.stringify([TARGET]))throw new Error('Expected only '+TARGET+' changed; got '+JSON.stringify(chg)); evidence.changedFiles=chg; evidence.preTargetSha256=ph[TARGET]; evidence.workTargetSha256=wh[TARGET];
  console.log('R5.2 freshness'); clasp(['clone',SID,'--rootDir','src'],F); const fsr=path.join(F,'src'),fn=files(fsr); if(JSON.stringify(fn)!==JSON.stringify(ns))throw new Error('Fresh file set changed'); same(ph,hashes(fsr,fn),ns,'Freshness');
  console.log('R5.2 push'); clasp(['push','--force'],W); pushed=true;
  console.log('R5.2 POST'); clasp(['clone',SID,'--rootDir','src'],O); const osrc=path.join(O,'src'),on=files(osrc); if(JSON.stringify(on)!==JSON.stringify(ns))throw new Error('POST file set changed'); const oh=hashes(osrc,on); same(ph,oh,ns.filter(n=>n!==TARGET),'POST untouched'); if(oh[TARGET]!==wh[TARGET])throw new Error('POST target hash mismatch'); run(process.execPath,['--check',path.join(osrc,TARGET)]);
  evidence.status='DEPLOYED_SOURCE_VERIFIED'; evidence.postTargetSha256=oh[TARGET]; evidence.fileCount=on.length; evidence.completedAt=new Date().toISOString(); evidence.businessWritesPerformed=false; evidence.runtimeNext='Rerun runSelectedTaskMappingRowEndToEndR4 on row 14; it must reuse Task 18504, remove legacy employees 6/20, and reconcile Field 854 without a blind retry.'; fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2)); console.log('DEPLOYED_SOURCE_VERIFIED'); console.log(JSON.stringify(evidence,null,2));
}catch(e){evidence.status='FAILED';evidence.error=String(e.stack||e);evidence.failedAt=new Date().toISOString();if(pushed){try{clasp(['push','--force'],P);evidence.rollback='ROLLBACK_PUSH_COMPLETED';}catch(r){evidence.rollback='ROLLBACK_FAILED';evidence.rollbackError=String(r.stack||r);}}else evidence.rollback='NOT_NEEDED_NO_PUSH';fs.writeFileSync(path.join(OUT,'evidence.json'),JSON.stringify(evidence,null,2));throw e;}
