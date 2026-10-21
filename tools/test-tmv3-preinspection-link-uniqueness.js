// JavaScript / Node.js: duplicate-footer cleanup and final verification contract.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={tmv3_clean_:v=>String(v??'').trim()};vm.createContext(c);
vm.runInContext(fs.readFileSync('apps-script/tmv3-clean/35_CalendarLinks.js','utf8'),c);
const plan={links:[{key:'ORDER',label:'View Sales Orders – Fixture (#123)',url:'https://example.invalid/orders?accountId=123'},
 {key:'TASK',label:'Task #456 – Fixture - 1 Test St, Toronto - (416) 555-0100',url:'https://example.invalid/Tasks/TaskInfo.aspx?TaskID=456'}]};
const notes='Original appointment<br>Pre-inspect fixture<br>SO 123456<br><a href="mailto:fixture@example.invalid">fixture@example.invalid</a>';
const canonical=notes+'<br><br>-----Striven Links-----<br>'+plan.links.map(c.tmv3_preInspectionHtmlLink_).join('<br>');
assert.equal(c.tmv3_assertPreInspectionLinkDescription_(canonical,plan),true);
const legacy='<br><br>-------- Pre-Inspection Task Link --------<br>Pre-Inspection Task #456<br>'+plan.links[1].url;
for(const bad of [canonical+legacy,canonical+'<br>-----Striven Links-----',canonical+'<br>'+c.tmv3_preInspectionHtmlLink_(plan.links[1]),canonical+'<br>'+plan.links[1].url,canonical.replace(plan.links[1].label,'Wrong label')]) {
 assert.throws(()=>c.tmv3_assertPreInspectionLinkDescription_(bad,plan));
 const repaired=c.tmv3_preInspectionClickableManagedDescription_(bad,plan);
 assert(repaired.description.startsWith(notes));
 assert.equal(c.tmv3_assertPreInspectionLinkDescription_(repaired.description,plan),true);
 assert.equal(c.tmv3_preInspectionClickableManagedDescription_(repaired.description,plan).changed,false);
}
const operations=fs.readFileSync('apps-script/tmv3-clean/58_Operations.js','utf8');
assert(operations.includes('tmv3_assertPreInspectionLinkDescription_(after, plan)'));
assert(operations.includes('tmv3_assertPreInspectionLinkDescription_(finalCopy.event.getDescription(), plan)'));
console.log('PASS: screenshot-shaped duplicate footer, duplicate headings/anchors/raw URLs, wrong labels, preserved notes/email, idempotence, pre/post-parity verification.');
