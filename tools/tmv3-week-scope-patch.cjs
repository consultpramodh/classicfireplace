// JavaScript / Node.js: add an optional bounded date scope to the existing worker.
'use strict';
function patch(source) {
  function replaceOnce(from,to){if(source.split(from).length!==2)throw Error('SOURCE_ANCHOR_DRIFT');source=source.replace(from,to);}
  replaceOnce("  options=options || {};\n  const policy=TMV3.OPERATIONS;", "  options=options || {};\n  const weekScope=tmv3_verticalRepairScope_(vertical,options);\n  const policy=TMV3.OPERATIONS;");
  replaceOnce("const stateKey='TMV3_VERTICAL_SWEEP_'+vertical;", "const stateKey='TMV3_VERTICAL_SWEEP_'+vertical+(weekScope ? '_RANGE_'+weekScope.fromDay+'_'+weekScope.toDay : '');");
  replaceOnce("if(!id||seen[id]||!day||day<today)return false;seen[id]=true;return true;", "if(!id||seen[id]||!day||day<(weekScope ? weekScope.fromDay : today)||weekScope && day>=weekScope.toDay)return false;seen[id]=true;return true;");
  replaceOnce("const record=tmv3_findFreshEventRecord_(vertical,id);\n        if(vertical==='Install'", "const record=tmv3_findFreshEventRecord_(vertical,id);\n        if(weekScope){const freshDay=tmv3_step6LocalDay_(record.start);if(!freshDay||freshDay<weekScope.fromDay||freshDay>=weekScope.toDay){result.results.push({eventId:id,status:'SKIPPED_MOVED_OUTSIDE_REPAIR_RANGE'});continue;}}\n        if(vertical==='Install'");
  source += `
// Google Apps Script: date-scoped owner repair through the unchanged canonical worker.
function tmv3_verticalRepairScope_(vertical,options) {
  if(!options || !options.fromDay && !options.toDay)return null;
  if(['Install','Delivery','Service'].indexOf(vertical)<0)throw Error('REPAIR_VERTICAL_INVALID');
  const valid=function(s){return typeof s==='string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(s) && !isNaN(new Date(s+'T12:00:00Z').getTime()) && new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;};
  if(!valid(options.fromDay)||!valid(options.toDay)||options.fromDay>=options.toDay||new Date(options.toDay)-new Date(options.fromDay)>7*86400000)throw Error('REPAIR_RANGE_INVALID_MAX_SEVEN_DAYS');
  return {fromDay:options.fromDay,toDay:options.toDay};
}
function tmv3_runWeeklyVerticalRepair(vertical,fromDay,toDay) {
  const scope=tmv3_verticalRepairScope_(vertical,{fromDay:fromDay,toDay:toDay});
  if(!scope)throw Error('REPAIR_RANGE_REQUIRED');
  const result=tmv3_verticalProductionCycle_(vertical,scope);
  PropertiesService.getScriptProperties().setProperty('TMV3_SHEET_REFRESH_PENDING','true');
  return result;
}
`;
  return source;
}
module.exports={patch};
