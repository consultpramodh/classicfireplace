'use strict';
// Offline source assembly and syntax inspection only. No live calls, writes, or deployment.
const fs=require('node:fs'),crypto=require('node:crypto'),vm=require('node:vm');
const baseline=JSON.parse(fs.readFileSync(process.env.TMV3_BACKUP_PATH||'reconstructed-live-3.12.21.json','utf8'));
const hash=crypto.createHash('sha256').update(JSON.stringify(baseline.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
if(hash!=='b5639671c9521ab387476c3a31cdfda7bf49906c46fd8e923102d3eb0bbe5e08')throw Error('BACKUP_SOURCE_HASH_MISMATCH');
const names=['tmv3-dispatch-state.js','tmv3-dispatch-result.js','tmv3-dispatch-coordinator.js','tmv3-dispatch-business-adapter.js','tmv3-dispatch-clock.js'];
const parts=baseline.files.filter(f=>f.type==='SERVER_JS').map(f=>f.source).concat(names.map(n=>fs.readFileSync('release-candidates/'+n,'utf8')));
new vm.Script(parts.join('\n;\n'),{filename:'offline-combined-apps-script.js'});
const combined=parts.join('\n;\n');for(const n of ['tmv3_preInspectionAutomationCycle_','tmv3_verticalProductionCycle_','tmv3_preInspectionLogSweep_','tmv3_installReminderCheck','tmv3_installSchedulePublication_','tmv3_refreshAutomationSheets','tmv3_dispatchHeartbeat_'])if(!new RegExp('function\\s+'+n+'\\s*\\(').test(combined))throw Error('MISSING_FUNCTION_'+n);
console.log(JSON.stringify({status:'OFFLINE_SYNTAX_AND_SYMBOL_PRESENCE_ONLY',baselineHash:hash,existingFiles:baseline.files.length,prototypeFiles:names.length,liveChanged:false}));
