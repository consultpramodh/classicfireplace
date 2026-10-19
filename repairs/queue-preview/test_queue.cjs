// JavaScript (Node.js): offline regression tests, no Google or Striven calls.
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ctx = vm.createContext({console, Date});
for (const name of ['11-01_config_menu.gs.txt','12-02_striven_core.gs.txt'])
  vm.runInContext(fs.readFileSync('backups/2026-10-19-uploaded/'+name.split('-').slice(1).join('-').slice(0,-4),'utf8'),ctx);
vm.runInContext(fs.readFileSync('repairs/queue-preview/04_actionhub.gs','utf8'),ctx);
vm.runInContext(`
var headers = ENP.HUB.HEADERS;
var col = enp_indexByHeader_(headers);
var base = {soId:27771,soNumber:'586037',qty:1,state:'PENDING',attempts:0,
rawDescription:'Item Number: G190-0004-SER Item Name: THERMOSTAT Price: $3',
parsedItemNumber:'G190-0004-SER',sourceSheet:'Enternewpart',sourceRow:2};
var row = enp_actionHubBuildRow_(base);
`,ctx);
assert.equal(ctx.row[0],27771); assert.equal(ctx.row[1],'586037');
let tests=2;
function check(expression,expected){assert.equal(vm.runInContext(expression,ctx),expected);tests++;}
check('enp_actionHubIsRunnableRow_(row,col,new Date())',true);
vm.runInContext("row[col.State]='REVIEW'",ctx);
check('enp_actionHubIsRunnableRow_(row,col,new Date())',false);
vm.runInContext("row[col.State]='FAILED'; row[col.LastError]='Striven 400 — Item Name already used'",ctx);
check('enp_actionHubIsRunnableRow_(row,col,new Date())',false);
vm.runInContext("row[col.LastError]='Striven 429 — rate limit'",ctx);
check('enp_actionHubIsRunnableRow_(row,col,new Date())',true);
vm.runInContext("row[col.NextRunAt]='invalid date'",ctx);
check('enp_actionHubIsRunnableRow_(row,col,new Date())',false);
vm.runInContext("row[col.NextRunAt]=''; row[col.Attempts]='PENDING'",ctx);
check('enp_actionHubIsRunnableRow_(row,col,new Date())',false);
vm.runInContext(`var written; var sheet={getRange:()=>({setValues:v=>{written=v[0]}})};
row=enp_actionHubBuildRow_(base);
enp_actionHubHandleFailure_(sheet,col,2,row,new Error('Striven 400 — Item Name already used'));`,ctx);
check('written[col.State]','REVIEW'); check('written[col.NextRunAt]','');
vm.runInContext("row=enp_actionHubBuildRow_(base); enp_actionHubHandleFailure_(sheet,col,2,row,new Error('Striven 429 — rate limit'))",ctx);
check('written[col.State]','PENDING');
check('written[col.NextRunAt] instanceof Date',true);
vm.runInContext(`var sc=enp_indexByHeader_(['SalesOrderSalesOrderId','Quantity','ItemDescription','ItemNumber','LastAction']);
var source=[27771,1,base.rawDescription,'ENTERNEWPART',''];
enp_actionHubAssertSource_(enp_actionHubRowToObject_(enp_actionHubBuildRow_(base),col),source,sc);`,ctx); tests++;
assert.throws(()=>vm.runInContext("source[0]=123; enp_actionHubAssertSource_(enp_actionHubRowToObject_(enp_actionHubBuildRow_(base),col),source,sc)",ctx),/identity changed/); tests++;
vm.runInContext(`var mismatch=ENP.HUB.HEADERS.slice(); mismatch[0]='WRONG';
var fake={getLastRow:()=>2,getLastColumn:()=>headers.length,getRange:()=>({getValues:()=>[mismatch]})};
var SpreadsheetApp={getActive:()=>({getSheetByName:()=>fake})};`,ctx);
assert.throws(()=>vm.runInContext('enp_getOrCreateActionHubSheet_()',ctx),/header order/);tests++;
console.log('PASS: '+tests+' offline queue regression assertions.');
