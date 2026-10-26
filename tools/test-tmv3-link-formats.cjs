// JavaScript / Node.js: per-vertical layout, clickable links, actual names and notes preservation.
'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const c={console};vm.createContext(c);
const dir=process.env.TMV3_TEST_SOURCE_DIR||'week-repair-local';for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js')&&!f.includes('-live')).sort())vm.runInContext(fs.readFileSync(dir+'/'+f,'utf8'),c);
for(const vertical of ['Install','Delivery','Service']){
 const plan={vertical,links:[...(vertical==='Install'?[]:[{key:'ORDER',url:'https://example.test/orders/12',label:(vertical==='Service'?'Work Order':'Sales Order')+' – 123456'}]),{key:'TASK_99',url:'https://example.test/task/99',label:'Task #99 – Example & Customer'}]};
 const original='<b>Human notes &amp; instructions</b><br>Keep this.<br><br>-----Striven Links-----\n[Task #99 – 99](https://example.test/task/99)';
 const out=c.tmv3_managedCalendarDescription_(original,plan);
 assert(out.includes('<b>Human notes &amp; instructions</b><br>Keep this.'));assert(out.includes('<a href="https://example.test/task/99">Task #99 - Example &amp; Customer</a>'));assert(!out.includes('[Task #'));
 assert(out.includes(vertical==='Install'?'Install Striven Task Link':vertical==='Delivery'?'Delivery Striven Links':'------- Striven Links -------'));
 assert.equal(c.tmv3_managedCalendarDescription_(out,plan),out);
 const raw=out.replace('Example &amp; Customer','99');assert.notEqual(c.tmv3_managedCalendarDescription_(raw,plan),raw);
 const wrongHeading=out.replace(vertical==='Install'?'Install Striven Task Link':vertical==='Delivery'?'Delivery Striven Links':'Striven Links','Wrong Vertical');assert.notEqual(c.tmv3_managedCalendarDescription_(wrongHeading,plan),wrongHeading);
 if(vertical==='Delivery')assert(out.includes('>SO #123456</a>'));
}
console.log('PASS: vertical-specific headings, clickable HTML, actual names, HTML escaping, notes, idempotence, numeric-label and wrong-heading repair');
