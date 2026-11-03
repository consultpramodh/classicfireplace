'use strict';
// Offline source candidate only; no live mutations or deployment.
const fs=require('fs'),crypto=require('crypto'),vm=require('vm');
const project=JSON.parse(fs.readFileSync(process.env.TMV3_BACKUP_PATH||'reconstructed-live-3.12.21.json','utf8'));
const sha=crypto.createHash('sha256').update(JSON.stringify(project.files.map(f=>({name:f.name,type:f.type,source:f.source||''})).sort((a,b)=>a.name.localeCompare(b.name)))).digest('hex');
if(sha!=='b5639671c9521ab387476c3a31cdfda7bf49906c46fd8e923102d3eb0bbe5e08')throw Error('BACKUP_SOURCE_HASH_MISMATCH');
const automation=project.files.find(f=>f.name==='60_Automation');if(!automation)throw Error('AUTOMATION_SOURCE_MISSING');
const marker='function tmv3_verticalProductionCycle_(',start=automation.source.indexOf(marker),end=automation.source.indexOf('\nfunction ',start+marker.length);if(start<0||end<0)throw Error('CYCLE_NOT_FOUND');
let cycle=automation.source.slice(start,end),old='const events=tmv3_rows_(TMV3.VERTICALS[vertical].sheet).filter(function(row){',replacement="const intakeRows=vertical==='Delivery' ? tmv3_deliveryFreshIntakeRows_() : tmv3_rows_(TMV3.VERTICALS[vertical].sheet);\n      const events=intakeRows.filter(function(row){";
if(cycle.split(old).length!==2)throw Error('CYCLE_ANCHOR_NOT_UNIQUE');cycle=cycle.replace(old,replacement);
automation.source=automation.source.slice(0,start)+cycle+automation.source.slice(end);const helper=fs.readFileSync('release-candidates/tmv3-delivery-fresh-intake.js','utf8');
if(automation.source.includes('function tmv3_deliveryFreshIntakeRows_('))throw Error('HELPER_ALREADY_PRESENT');
automation.source+='\n\n'+helper+'\n';
new vm.Script(project.files.filter(f=>f.type==='SERVER_JS').map(f=>f.source).join('\n;\n'));
fs.writeFileSync('delivery-intake-candidate.json',JSON.stringify(project));console.log('PASS: Delivery-only offline patch built; no live changes');
