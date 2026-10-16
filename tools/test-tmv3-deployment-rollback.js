// JavaScript / Node.js: exercise workflow Bash with a fake clasp; no network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const workflow = fs.readFileSync(path.join(__dirname,'../.github/workflows/tmv3-clean-bootstrap.yml'),'utf8');
const guard = workflow.slice(workflow.indexOf('          rollback() {'),workflow.indexOf('\n          if [ -z "$SCRIPT_ID" ]; then'))
  .split('\n').map(line=>line.replace(/^ {10}/,'')).join('\n');
const push = workflow.slice(workflow.indexOf('          echo "Pushing only clean V3 source."'),workflow.indexOf('\n          # Apps Script supports at most'))
  .split('\n').map(line=>line.replace(/^ {10}/,'')).join('\n');
assert.ok(guard.includes('PUSH_ATTEMPTED')); assert.ok(push.indexOf('PUSH_ATTEMPTED=1')<push.indexOf('npx'));
function scenario({pushStatus=0,rollbackStatus=0,cloneStatus=0,mismatch=false,preflight=false,backup=true}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tmv3-rollback-'));
  for(const dir of ['pre/src','work']) fs.mkdirSync(path.join(root,dir),{recursive:true});
  fs.writeFileSync(path.join(root,'remote'),'before');
  fs.writeFileSync(path.join(root,'pre/src/20_Striven.js'),'before\n');
  const script=`set -euo pipefail
PRE="$TEST_ROOT/pre"
WORK="$TEST_ROOT/work"
CLASP_VERSION=3.3.0
TMP="$TEST_ROOT"
SCRIPT_ID=test-only-project
PUSH_ATTEMPTED=0
HAD_PRE=${backup?1:0}
npx() {
  case "$*" in
    *clone*)
      echo readback >> "$TEST_ROOT/calls"
      if [ "${cloneStatus}" -ne 0 ]; then return ${cloneStatus}; fi
      mkdir -p src
      ${mismatch?'echo mismatch > src/20_Striven.js':'cp "$TEST_ROOT/remote" src/20_Striven.js'}
      return 0 ;;
  esac
  if [ "$PWD" = "$PRE" ]; then
    echo rollback >> "$TEST_ROOT/calls"
    if [ "${rollbackStatus}" -ne 0 ]; then return ${rollbackStatus}; fi
    echo before > "$TEST_ROOT/remote"
    return 0
  fi
  echo push >> "$TEST_ROOT/calls"
  echo changed > "$TEST_ROOT/remote"
  return ${pushStatus}
}
${guard}
${preflight?'exit 23':push}
`;
  const result=spawnSync('bash',['-c',script],{encoding:'utf8',env:{...process.env,TEST_ROOT:root}});
  const calls=fs.existsSync(path.join(root,'calls'))?fs.readFileSync(path.join(root,'calls'),'utf8').trim().split('\n'):[];
  const remote=fs.readFileSync(path.join(root,'remote'),'utf8').trim();
  fs.rmSync(root,{recursive:true,force:true}); return {...result,calls,remote};
}
let r=scenario({pushStatus:17});
assert.equal(r.status,17); assert.deepEqual(r.calls,['push','rollback','readback']); assert.equal(r.remote,'before');
assert.match(r.stdout,/ROLLBACK_SOURCE_VERIFIED/);
console.log('PASS partial push failure restores PRE and preserves failed exit');
r=scenario({preflight:true});assert.equal(r.status,23);assert.deepEqual(r.calls,[]);assert.equal(r.remote,'before');
console.log('PASS preflight failure does not touch remote');
r=scenario({});assert.equal(r.status,0);assert.deepEqual(r.calls,['push']);assert.equal(r.remote,'changed');
console.log('PASS successful push does not trigger rollback');
r=scenario({pushStatus:17,rollbackStatus:19});assert.equal(r.status,17);assert.match(r.stdout,/ROLLBACK_FAILED/);assert.match(r.stdout,/ROLLBACK_UNVERIFIED/);
console.log('PASS rollback failure is explicit and deployment remains failed');
r=scenario({pushStatus:17,backup:false});assert.equal(r.status,17);assert.deepEqual(r.calls,['push']);
console.log('PASS absent PRE backup is not fabricated');
r=scenario({pushStatus:17,cloneStatus:21});assert.equal(r.status,17);assert.match(r.stdout,/ROLLBACK_READBACK_FAILED/);
assert.doesNotMatch(r.stdout,/ROLLBACK_SOURCE_VERIFIED/);
console.log('PASS failed rollback readback never claims restoration');
r=scenario({pushStatus:17,mismatch:true});assert.equal(r.status,17);assert.match(r.stdout,/ROLLBACK_SOURCE_MISMATCH/);
assert.doesNotMatch(r.stdout,/ROLLBACK_SOURCE_VERIFIED/);
console.log('PASS mismatched rollback source never claims restoration');
console.log('7 rollback scenarios passed');
