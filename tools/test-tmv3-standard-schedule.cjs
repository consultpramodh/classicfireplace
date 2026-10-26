'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('apps-script/tmv3-clean/60_Automation.js','utf8');new vm.Script(source);
let triggers=['tmv3_allVerticalAutomationTick','tmv3_scheduledOperations','tmv3_calendarEventUpdated','tmv3_installReminderCheck'].map(handler=>({handler,getHandlerFunction(){return this.handler;}}));const created=[];
const c={ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:t=>{triggers=triggers.filter(x=>x!==t);},newTrigger:handler=>{const spec={handler};const b={timeBased:()=>b,atHour:h=>{spec.hour=h;return b;},nearMinute:m=>{spec.minute=m;return b;},everyDays:d=>{spec.days=d;return b;},inTimezone:z=>{spec.timezone=z;return b;},everyHours:h=>{spec.interval=h;return b;},create:()=>{const t={...spec,getHandlerFunction(){return this.handler;}};triggers.push(t);created.push(t);return t;}};return b;}},PropertiesService:{getScriptProperties:()=>({setProperty(){}})},tmv3_listTriggers:()=>triggers.map(t=>({handler:t.handler}))};
vm.createContext(c);vm.runInContext(source,c);c.tmv3_listTriggers=()=>triggers.map(t=>({handler:t.handler}));
const r=c.tmv3_installStandardDailyTriggers();assert.equal(r.businessTriggerCount,12);assert.equal(triggers.length,14);
for(const v of ['preInspection','install','delivery','service'])for(const hour of [8,13,17]){const h='tmv3_'+v+'Check'+String(hour).padStart(2,'0')+'00';assert.equal(typeof c[h],'function');const t=created.find(t=>t.handler===h);assert.equal(t.hour,hour);assert.equal(t.timezone,'America/Toronto');assert.equal(t.days,1);}
for(const fn of ['tmv3_scheduledOperations','tmv3_calendarEventUpdated','tmv3_calendarReconciliationFallback'])assert.equal(c[fn]().businessWrites,0);
c.tmv3_installStandardDailyTriggers();assert.equal(triggers.length,14);
console.log('PASS: 12 independent daily triggers, Toronto hours, 2 maintenance triggers, retired entrypoints, idempotent reinstall');
