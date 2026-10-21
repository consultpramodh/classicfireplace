// JavaScript / Node.js: pure, exact-match patch of the reviewed live project.
'use strict';
function once(s,a,b){if(s.split(a).length!==2)throw Error('PATCH_CONTEXT_NOT_UNIQUE:'+a.slice(0,90));return s.replace(a,b);}
function fn(s,name){const start=s.indexOf('function '+name+'(');if(start<0||s.indexOf('function '+name+'(',start+1)>=0)throw Error('FUNCTION_NOT_UNIQUE:'+name);const end=s.indexOf('\nfunction ',start+1);return s.slice(start,end<0?undefined:end);}
const recovery=`function tmv3_preInspectionAutomaticRecovery_(reason) {
  const hour=Number(Utilities.formatDate(new Date(),TMV3_TIMEZONE,'H'));
  if(hour<8||hour>18) return {status:'OUTSIDE_PREINSPECTION_RECOVERY_HOURS',writes:0};
  const props=PropertiesService.getScriptProperties();
  let state=null;
  try {state=JSON.parse(props.getProperty('TMV3_PI_SWEEP_STATE')||'null');} catch(ignored) {}
  if(!state||state.status!=='IN_PROGRESS') return {status:'NO_STALLED_PREINSPECTION_SWEEP',writes:0};
  const last=Number(props.getProperty('TMV3_PI_LAST_CYCLE')||0);
  if(Date.now()-last<20*60000) return {status:'RECENT_PREINSPECTION_BATCH',writes:0};
  // Existing scheduled jobs provide recovery; no API executable or manual run needed.
  tmv3_preInspectionClearContinuationTrigger_();
  const result=tmv3_preInspectionAutomationCycle_({force:true,sweepContinue:true,reason:'AUTOMATIC_RECOVERY_'+reason});
  tmv3_preInspectionMaybeContinueSweep_(result);
  tmv3_preInspectionLogSweep_('RECOVERY',result);
  return result;
}
`;
const continueSweep=`function tmv3_preInspectionMaybeContinueSweep_(result) {
  const errors=[result.error||''].concat((result.results||[]).map(function(r){return r.error||'';})).join(' ');
  if(result.status==='API_BUDGET_WAIT'||/TMV3_STRIVEN_API_DAILY_GUARD|daily api usage limit/i.test(errors)) {
    result.continuation='WAIT_FOR_DAILY_API_BUDGET';
    return result;
  }
  // A reviewed historical relationship is not an infrastructure failure.
  const allTechnicalFailures=(result.results||[]).length>0 &&
    result.results.every(function(r){return !!r.error;});
  if(allTechnicalFailures) {
    result.continuation='PAUSED_TECHNICAL_FAILURE_AUTOMATIC_RECOVERY';
    return result;
  }
  if((result.sweep&&result.sweep.remaining>0)||result.status==='LOCK_BUSY') {
    try {result.continuation=tmv3_preInspectionScheduleNextSweep_();}
    catch(err) {
      result.status='ATTENTION';result.continuation='SCHEDULING_FAILED';
      result.error=String(err&&err.message||err);
      tmv3_audit_('PreInspection','','','ELIGIBLE_SWEEP','ATTENTION',result.error);
      tmv3_preInspectionFailureAlert_('',result.error);
    }
  }
  return result;
}
`;
function patch(before,footerHelper){
 const work={files:before.files.map(f=>({...f}))};
 const file=name=>{const f=work.files.find(x=>x.name===name);if(!f)throw Error('FILE_MISSING:'+name);return f;};
 const cfg=file('00_Config');
 cfg.source=once(cfg.source,"const TMV3_VERSION = '3.11.96-preinspection-full-eligible-sweep-r1';","const TMV3_VERSION = '3.11.97-preinspection-automatic-recovery-r1';");
 cfg.source=once(cfg.source,'    v3DailySoftLimit: 1200,','    v3DailySoftLimit: 1200,\n    preInspectionReservedCalls: 200,');
 const api=file('20_Striven');
 api.source=once(api.source,'var TMV3_CANARY_API_ALLOWANCE_ACTIVE = false;','var TMV3_CANARY_API_ALLOWANCE_ACTIVE = false;\nvar TMV3_PREINSPECTION_API_CONTEXT_ACTIVE = false;');
 api.source=once(api.source,'    remaining: Math.max(0, softLimit - count),',`    remaining: Math.max(0, tmv3_strivenApiEffectiveSoftLimit_({softLimit:softLimit},cfg) - count),
    preInspectionReservedCalls: Number(cfg.preInspectionReservedCalls || 0),`);
 api.source=once(api.source,`  return Math.min(
    planDailyLimit,
    baseSoftLimit + extra
  );`, `  const ceiling=Math.min(planDailyLimit,baseSoftLimit+extra);
  // Ring-fence within the existing 1,200-call V3 allowance, never above it.
  const reserve=mode==='PRODUCTION_WRITE' && TMV3_PREINSPECTION_API_CONTEXT_ACTIVE!==true
    ? Math.min(ceiling,Math.max(0,Number(cfg.preInspectionReservedCalls || 0))) : 0;
  return ceiling-reserve;`);
 const auto=file('60_Automation');let s=auto.source;
 s=once(s,"tmv3_preInspectionAutomationCycle_({reason:'HOURLY_FALLBACK'})","tmv3_preInspectionAutomaticRecovery_('HOURLY_FALLBACK')");
 s=once(s,"tmv3_preInspectionAutomationCycle_({reason:'SCHEDULED_OPERATIONS'})","tmv3_preInspectionAutomaticRecovery_('SCHEDULED_OPERATIONS')");
 let cycle=fn(s,'tmv3_preInspectionAutomationCycle_');const oldCycle=cycle;
 cycle=once(cycle,"  const result = {status:'COMPLETE',processed:0,writes:0,notifications:0,results:[]};\n  try {",`  const result = {status:'COMPLETE',processed:0,writes:0,notifications:0,results:[]};
  const previousApiContext=TMV3_PREINSPECTION_API_CONTEXT_ACTIVE;
  TMV3_PREINSPECTION_API_CONTEXT_ACTIVE=true;
  try {
    const budget=tmv3_strivenApiBudgetStatus_();
    if(budget.exhausted||budget.remaining<30) {
      result.status='API_BUDGET_WAIT';result.apiBudget=budget;
      result.resume='NEXT_SCHEDULED_SLOT_AFTER_DAILY_RESET';
      const pauseKey='TMV3_PI_BUDGET_PAUSE_DATE';
      if(props.getProperty(pauseKey)!==budget.date) {
        props.setProperty(pauseKey,budget.date);
        tmv3_audit_('PreInspection','','','PREINSPECTION_API_BUDGET_WAIT','WAIT',JSON.stringify({date:budget.date,count:budget.count,softLimit:budget.softLimit,resume:result.resume,triggers:tmv3_listTriggers()}));
      }
      props.setProperty('TMV3_PI_LAST_RESULT',JSON.stringify(result));
      return result;
    }`);
 cycle=once(cycle,'  } finally {lock.releaseLock();}', '  } finally {TMV3_PREINSPECTION_API_CONTEXT_ACTIVE=previousApiContext;lock.releaseLock();}');
 cycle=once(cycle,"        tmv3_preInspectionFailureAlert_(record.eventId,one.error);\n      }\n      result.results.push(one);",`        tmv3_preInspectionFailureAlert_(record.eventId,one.error);
        if(/TMV3_STRIVEN_API_DAILY_GUARD|daily api usage limit/i.test(one.error)) {
          // Preserve this event's cursor position for a fresh reconciliation after reset.
          result.status='API_BUDGET_WAIT';result.processed--;
          result.results.push(one);break;
        }
      }
      result.results.push(one);`);
 s=once(s,oldCycle,cycle);
 s=once(s,fn(s,'tmv3_preInspectionMaybeContinueSweep_'),continueSweep.trimEnd()+'\n');
 s=s.trimEnd()+'\n\n'+recovery;
 const oldLog=fn(s,'tmv3_preInspectionLogSweep_');
 const newLog=once(oldLog,'  Logger.log(JSON.stringify({','  const summary={');
 const log=once(newLog,'  }));\n}',"  };\n  Logger.log(JSON.stringify(summary));\n  tmv3_audit_('PreInspection','','','PREINSPECTION_SWEEP',result.status||'UNKNOWN',JSON.stringify(summary));\n}");
 s=once(s,oldLog,log);
 s=once(s,"  if (!assessment.shouldNotify) return {status:'NO_MISSING_DETAILS',sent:0};", "  if (!assessment.shouldNotify || (assessment.missing||[]).every(function(item){return item.code==='SALES_ORDER';})) return {status:'NO_MISSING_DETAILS',sent:0};");
 auto.source=s;
 if(footerHelper){
  const links=file('35_CalendarLinks');if(links.source.includes('function tmv3_assertPreInspectionLinkDescription_('))throw Error('FOOTER_HELPER_ALREADY_PRESENT');
  links.source=links.source.trimEnd()+'\n\n'+footerHelper.trim()+'\n';
  const ops=file('58_Operations');
  ops.source=once(ops.source,"    const after = String(readBackFound.event.getDescription() || '');", "    const after = String(readBackFound.event.getDescription() || '');\n    if (eventRecord.vertical === 'PreInspection') tmv3_assertPreInspectionLinkDescription_(after, plan);");
  const marker="  return {\n    status: 'CALENDAR_LINKS_VERIFIED',";
  ops.source=once(ops.source,marker,`  if(eventRecord.vertical==='PreInspection') copies.forEach(function(copy){
    const finalCopy=tmv3_findEventCopyRobust_(copy.calendarId,plan.eventId);
    if(!finalCopy||!finalCopy.event) throw new Error('PREINSPECTION_FINAL_COPY_MISSING');
    tmv3_assertPreInspectionLinkDescription_(finalCopy.event.getDescription(), plan);
  });\n\n`+marker);
 }
 return work;
}
module.exports={patch,fn};
