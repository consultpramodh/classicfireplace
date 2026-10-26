// JavaScript / Node.js: retire only superseded PreInspection mutation entrypoints.
'use strict';
const vm=require('node:vm');
const functions={
 '35_PreInspect_Task_Review':{
  runPreInspectScheduledPipeline:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false,strivenWritesPerformed:false,calendarWritesPerformed:false};',
  runSelectedPreInspectEndToEnd:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};',
  runPreInspectReconcileOpenTasksFromAppsScript:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};',
  preinspectR3412NormalizeOpenTaskTitles_:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};',
  preinspectR3416ReconcileMappedOpenTasks_:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};',
  preinspectR3420ApplyPreinspect_:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};',
  preinspectR3420AutoEnabled_:'return false;',
  preinspectR30PatchTask_:'throw new Error("RETIRED_TO_V3_PREINSPECTION: use canonical V3 executor");',
  preinspectR3416CreateOrReuseSelectedLocation_:'throw new Error("RETIRED_TO_V3_PREINSPECTION: use canonical V3 executor");',
  preinspectR3418bPushExactCalendarDateTimeForActiveMapping_:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};'
 },
 '36_PreInspect_Task_Create':{createSelectedPreInspectTask_MANUAL_WRITE:'throw new Error("RETIRED_TO_V3_PREINSPECTION: use canonical V3 executor");'},
 '92_Striven_Task_Patch_Helper':{taskRecoveryRunPreInspectWorkflowSilent:'return {status:"RETIRED_TO_V3_PREINSPECTION",writesPerformed:false};'}
};
function patch(before){let cases=0;const files=before.files.map(f=>{
 if(!functions[f.name])return f;let source=f.source;
 for(const [name,guard]of Object.entries(functions[f.name])){
  const re=new RegExp('function\\s+'+name+'\\s*\\([^)]*\\)\\s*\\{','g');const found=Array.from(source.matchAll(re));if(found.length!==1)throw Error('LEGACY_ENTRY_NOT_UNIQUE:'+name);
  const at=found[0].index+found[0][0].length;
  source=source.slice(0,at)+'\n  // V3 owns PreInspection; retained implementation is rollback history only.\n  '+guard+'\n'+source.slice(at);
  const context={};vm.runInNewContext(found[0][0]+guard+'}',context);
  if(guard.startsWith('throw')){let threw=false;try{context[name]();}catch(e){threw=/RETIRED_TO_V3_PREINSPECTION/.test(e.message);}if(!threw)throw Error('RETIREMENT_GUARD_FAILED');}
  else {const r=context[name]();if(name==='preinspectR3420AutoEnabled_'?r!==false:r.status!=='RETIRED_TO_V3_PREINSPECTION')throw Error('RETIREMENT_GUARD_FAILED');}
  cases++;
 }
 new vm.Script(source,{filename:f.name});return {...f,source};
});
 if(files.filter(f=>functions[f.name]).length!==Object.keys(functions).length)throw Error('LEGACY_MODULE_MISSING');
 return {files,cases};}
module.exports={patch,functions};
