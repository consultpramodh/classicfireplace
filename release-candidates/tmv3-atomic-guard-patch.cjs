'use strict';
// Local candidate builder only. Never sends source or modifies a live project.
const fs=require('node:fs'),crypto=require('node:crypto');
const path=process.env.TMV3_BACKUP_PATH || 'reconstructed-live-3.12.21.json';
const x=JSON.parse(fs.readFileSync(path,'utf8'));
const digest=o=>crypto.createHash('sha256').update(JSON.stringify(o.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
if(digest(x)!=='b5639671c9521ab387476c3a31cdfda7bf49906c46fd8e923102d3eb0bbe5e08')throw Error('BACKUP_SOURCE_HASH_MISMATCH');
const f=x.files.find(f=>f.name==='60_Automation');if(!f)throw Error('AUTOMATION_SOURCE_MISSING');
const s=f.source,start=s.indexOf('function tmv3_preInspectionAutomationCycle_('),anchor=s.indexOf('  try {\n',start);if(start<0||anchor<0)throw Error('GUARD_ANCHOR_MISSING');
const inject=`    // Watchdog may resume only after rechecking the durable sweep state under this script lock.\n    if (Object.prototype.hasOwnProperty.call(options,'watchdogBaseline')) {\n      const decision=tmv3_preInspectionResumeDecision_(options.watchdogBaseline,props.getProperty('TMV3_PI_SWEEP_STATE') || '');\n      if (decision==='FINISHED') return {status:'NO_ACTIVE_PREINSPECTION_SWEEP',processed:0,writes:0};\n      if (decision==='INVALID' || decision==='REVIEW') return {status:'ATTENTION',processed:0,writes:0,error:'PREINSPECTION_WATCHDOG_STATE_'+decision};\n      options.sweepContinue=decision==='CONTINUE';\n      options.sweepStart=decision==='START';\n    }\n`;
const pos=anchor+'  try {\n'.length;f.source=s.slice(0,pos)+inject+s.slice(pos);fs.writeFileSync('atomic-guard-candidate.json',JSON.stringify(x));console.log('Candidate built; no live changes');
