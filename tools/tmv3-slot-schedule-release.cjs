'use strict';
// Surgical schedule release. Never log or publish source, credentials or task data.
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm'),cp=require('node:child_process');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
const names=['tmv3_preInspectionScheduleNextSweep_','tmv3_preInspectionContinueEligibleSweep','tmv3_runPreInspectionDailySlot_','tmv3_refreshAutomationSheetsAfter_','tmv3_scheduledSheetRefresh','tmv3_installAutomationSheetRefreshTrigger','tmv3_installStandardDailyTriggers','tmv3_runFullVerticalSweep_','tmv3_installSweepContinue','tmv3_deliverySweepContinue','tmv3_serviceSweepContinue','tmv3_serviceDeliveryOrderBackfill','tmv3_serviceDeliveryOrderBackfill_','tmv3_resumeFullVerticalQueues','tmv3_installSchedulePublication_','tmv3_installPublishView'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const digest=o=>hash(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name))));
function part(s,name){const marker='function '+name+'(';const a=s.indexOf(marker);if(a<0||s.indexOf(marker,a+1)>=0)throw Error('FUNCTION_MISSING_OR_DUPLICATED:'+name);const m=/\nfunction\s+[A-Za-z_$][\w$]*\s*\(/g;m.lastIndex=a+marker.length;const hit=m.exec(s);return {a,b:hit?hit.index+1:s.length,text:s.slice(a,hit?hit.index+1:s.length)};}
(async()=>{
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('ONE_OAUTH_PROFILE_REQUIRED');const p=ps[0];
 const ar=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh})});if(!ar.ok)throw Error('AUTH_FAILED');const auth=await ar.json();
 async function req(url,method='GET',body){const r=await fetch(url,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(600000)});if(!r.ok)throw Error('API_HTTP_'+r.status+':'+url.split('?')[0]);return r.json();}
 const api=(path,method,body)=>req('https://script.googleapis.com/v1/'+path,method,body);
 const before=await api('projects/'+SID+'/content');let versions=[],page='';do{const v=await api('projects/'+SID+'/versions?pageSize=50'+(page?'&pageToken='+encodeURIComponent(page):''));versions.push(...(v.versions||[]));page=v.nextPageToken||'';}while(page);
 const inv=await api('projects/'+SID+'/deployments');const deployments=inv.deployments||[];const execs=deployments.filter(d=>(d.entryPoints||[]).some(e=>e.entryPointType==='EXECUTION_API'||e.executionApi));
 if(versions.length>=5)throw Error('VERSION_LIMIT_REACHED_NO_CHANGES');if(execs.length!==1)throw Error('EXECUTION_DEPLOYMENT_AMBIGUOUS');
 const baseline=await api('projects/'+SID+'/content?versionNumber=203');const live=before.files.find(f=>f.name==='60_Automation'),base=baseline.files.find(f=>f.name==='60_Automation');if(!live||!base)throw Error('AUTOMATION_SOURCE_MISSING');
 const candidate=fs.readFileSync('release-candidates/slot-functions-20261102.js','utf8');let source=live.source;
 for(const name of names){const b=part(base.source,name),l=part(source,name),c=part(candidate,name);if(l.text.trim()!==b.text.trim())throw Error('LIVE_FUNCTION_DRIFT:'+name);source=source.slice(0,l.a)+c.text+source.slice(l.b);}
 const cfg=before.files.find(f=>f.name==='00_Config');if(!cfg||!cfg.source.includes('3.12.18-preinspection-discovery-targeted-r1'))throw Error('LIVE_VERSION_MISMATCH');
 const out={files:before.files.map(f=>f.name==='60_Automation'?{...f,source}:f.name==='00_Config'?{...f,source:f.source.replace('3.12.18-preinspection-discovery-targeted-r1','3.12.20-standard-slot-schedule-r1')}:f)};
 for(const f of out.files)if(f.type==='SERVER_JS')new vm.Script(f.source,{filename:f.name});
 // Execute tests against the actual live-derived candidate, in this private runner only.
 for(const f of out.files)if(f.type==='SERVER_JS')fs.writeFileSync('apps-script/tmv3-clean/'+f.name+'.js',f.source);
 for(const test of ['tools/test-tmv3-standard-schedule.cjs','tools/test-tmv3-automatic-sheet-refresh.cjs','tools/test-tmv3-full-vertical-sweep.cjs','tests/preinspection/standard-slots-only.test.cjs','tests/preinspection/sweep-start-recovery.test.cjs'])cp.execFileSync('node',[test],{stdio:'pipe'});
 // Prepare encrypted backup for private off-runner storage and read-back verification.
 const raw=JSON.stringify({scriptId:SID,createdAt:new Date().toISOString(),versions,deployments,content:before});
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(raw,'utf8'),cipher.final()]);
 const wrapped=crypto.publicEncrypt({key:fs.readFileSync('release-candidates/slot-backup-public.pem'),oaepHash:'sha256'},key);
 fs.writeFileSync('slot-backup.enc',JSON.stringify({wrapped:wrapped.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64'),rawHash:hash(raw),beforeHash:digest(before)}));
 console.log(JSON.stringify({status:'ENCRYPTED_BACKUP_PREPARED',beforeHash:digest(before),rawHash:hash(raw),versions:versions.map(v=>v.versionNumber)}));
 return;
 if(digest(await api('projects/'+SID+'/content'))!==digest(before))throw Error('SOURCE_DRIFT_BEFORE_WRITE');
 console.log(JSON.stringify({stage:'BACKUP_VERIFIED',backupId:backup.id,beforeHash:digest(before),versions:versions.map(v=>v.versionNumber)}));
 await api('projects/'+SID+'/content','PUT',out);if(digest(await api('projects/'+SID+'/content'))!==digest(out))throw Error('SOURCE_READBACK_FAILED');
 const ver=await api('projects/'+SID+'/versions','POST',{description:'3.12.20 standard slot schedule'});
 const deployment=execs[0],config=deployment.deploymentConfig;if(!config||!config.manifestFileName)throw Error('DEPLOYMENT_CONFIG_UNAVAILABLE');
 await api('projects/'+SID+'/deployments/'+encodeURIComponent(deployment.deploymentId),'PUT',{deploymentConfig:{...config,versionNumber:ver.versionNumber,description:'3.12.20 standard slot schedule'}});
 async function run(fn){const r=await api('scripts/'+encodeURIComponent(deployment.deploymentId)+':run','POST',{function:fn,devMode:true});if(r.error||!r.done)throw Error('EXECUTION_FAILED:'+fn);return r.response.result;}
 const health=await run('tmv3_healthCheck');if(!health.ready||health.version!=='3.12.20-standard-slot-schedule-r1')throw Error('HEALTH_CHECK_FAILED');
 const install=await run('tmv3_installStandardDailyTriggers');const triggers=await run('tmv3_listTriggers');if(install.status!=='STANDARD_DAILY_TRIGGERS_VERIFIED')throw Error('TRIGGER_INSTALL_FAILED');
 const finalVersions=await api('projects/'+SID+'/versions?pageSize=50');if((finalVersions.versions||[]).length>5||finalVersions.nextPageToken)throw Error('VERSION_RETENTION_FAILED');
 console.log(JSON.stringify({status:'RELEASE_VERIFIED',version:health.version,versionNumber:ver.versionNumber,backupId:backup.id,sourceHash:digest(out),triggerHandlers:triggers.map(t=>t.handler),retainedVersions:(finalVersions.versions||[]).map(v=>v.versionNumber)}));
})().catch(e=>{console.error(JSON.stringify({status:'STOPPED',error:e.message}));process.exitCode=1;});
