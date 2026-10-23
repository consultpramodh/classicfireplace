// JavaScript / Node.js: read-only production readiness evidence; never invokes business workers.
'use strict';
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const {profiles}=require('./tmv3-execution-access-diagnostic.js');
const SID='1shaSL1CeNhR2-fr8H4x0fP2KUIjpOizLFyrNRAnGGXkCvERX4hZyJ5Gt';
async function main(){
 const ps=profiles(JSON.parse(process.env.CLASPRC_JSON||'{}'));if(ps.length!==1)throw Error('EXPECTED_ONE_PROFILE');const p=ps[0];
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:p.client,client_secret:p.secret,refresh_token:p.refresh}),redirect:'error'});if(!r.ok)throw Error('AUTH_HTTP_'+r.status);const auth=await r.json();
 async function api(path,method='GET',body){const r=await fetch('https://script.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+auth.access_token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('GOOGLE_HTTP_'+r.status);return r.json();}

 const LEGACY='1E86mhD2dZcOFpqWnCvoIpwEkwZ0MA63MgM8DifV6WyB2FvVQkRWKIZ_m';
 const hash=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
 const source=await api('projects/'+LEGACY+'/content'),v3=await api('projects/'+SID+'/content');
 if(hash(source)!=='beb5a03f3e004c55664c6d865e8f22fde5ce2f1f4c9ca70cea7b96d02a2e603c'||hash(v3)!=='b24458af54c9282f2332163eb5fdcffab552899726cf12778fa9448f01b18b0e')throw Error('SOURCE_DRIFT');
 const report={legacySourceVerified:true,v3Unchanged:true,sourceWrites:0,calendarWrites:0,strivenWrites:0,legacyHash:hash(source),v3Hash:hash(v3)};
 const events=[];
 for(const cid of ['c_3088a3989f3eb809957ed5c40137a7111a0ac97f68c29b40c144028cb14320dc@group.calendar.google.com','classicfireplace.ca_c20qcqfhvjbv784asn9pvuiaf4@group.calendar.google.com']){
  const res=await fetch('https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(cid)+'/events/62odlrnni7nid3ckesp8eua4co',{headers:{Authorization:'Bearer '+auth.access_token},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!res.ok){report.calendarRestReadStatus='HTTP_'+res.status;break;}events.push({calendarId:cid,event:await res.json()});
 }
 if(events.length===2){
  const helper=fs.readFileSync('tools/preinspect-v3-link-owner.gs','utf8');
  const c={Logger:{log(){}},TM_PREINSPECT_DUAL_CALENDAR_R1:{GROUP_CALENDAR_ID:events[0].calendarId,STEPHEN_CALENDAR_ID:events[1].calendarId},tmPreInspectFindCalendarEventById_:(id)=>({event:{getDescription:()=>events.find(x=>x.calendarId===id).event.description}})};
  vm.createContext(c);vm.runInContext(helper,c);
  report.liveCalendarGuard=c.verifyPreinspectV3CanonicalLinkOwnership('62odlrnni7nid3ckesp8eua4co@google.com',19320);
  if(!report.liveCalendarGuard.readBackVerified||report.liveCalendarGuard.calendarWritesPerformed)throw Error('LIVE_CALENDAR_GUARD_CHECK_FAILED');
  report.liveNotesVerified=events.every(x=>['Robert HANSEN','Check on Install for NOV2','Green Mountain 40'].every(t=>x.event.description.includes(t)));
  if(!report.liveNotesVerified)throw Error('NOTES_READBACK_FAILED');
 }else report.liveCalendarGuard='NO_DIRECT_CALENDAR_SCOPE; native connector readbacks are separate evidence';
 fs.mkdirSync('link-postcheck-evidence',{recursive:true});fs.writeFileSync('link-postcheck-evidence/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
