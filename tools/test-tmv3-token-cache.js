// JavaScript / Node.js: no real credentials, network calls, or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../apps-script/tmv3-clean/20_Striven.js'), 'utf8');
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS ' + name); }
function runtime(options = {}) {
  const observed = {fetches: 0, reservations: [], cached: [], properties: 0};
  const context = vm.createContext({
    TMV3: {API_BASE: 'https://example.invalid', PROPERTIES: {CLIENT_ID: ['id'], CLIENT_SECRET: ['secret']}},
    CacheService: {getScriptCache: () => ({get: () => options.cached || '', put: (...args) => observed.cached.push(args)})},
    UrlFetchApp: {fetch: () => {observed.fetches++; return {
      getResponseCode: () => options.status || 200,
      getContentText: () => JSON.stringify(options.body || {access_token: 'test-only-token', expires_in: 86400})
    };}},
    Number, Math, JSON, Object, String, Error
  });
  vm.runInContext(source, context);
  context.tmv3_clean_ = value => String(value || '').trim();
  context.tmv3_property_ = () => {observed.properties++; return 'test-only';};
  context.tmv3_reserveStrivenApiCall_ = label => {observed.reservations.push(label); if(options.block) throw new Error('budget blocked');};
  context.tmv3_markStrivenDailyLimitExhausted_ = () => {};
  return {context, observed};
}
for (const [input, expected] of [[86400,21600],[3600,3300],['7200',6900],[301,1],[300,0],[60,0],[0,0],[-1,0],[null,0],[undefined,0],['',0],['bad',0],[Infinity,0],[3600.9,3300]]) {
  test('expiry ' + String(input), () => assert.equal(runtime().context.tmv3_strivenTokenCacheSeconds_(input), expected));
}
test('cache hit performs no authentication or budget reservation', () => {
  const {context:c, observed:o} = runtime({cached:'existing-test-token'});
  assert.equal(c.tmv3_token_(), 'existing-test-token');
  assert.equal(o.fetches,0); assert.equal(o.properties,0); assert.equal(o.reservations.length,0);
  assert.equal(c.TMV3_RUNTIME_METRICS.strivenApiCalls,0);
});
test('long-lived token uses six-hour cache and is counted', () => {
  const {context:c, observed:o} = runtime(); c.tmv3_token_();
  assert.equal(o.cached[0][2],21600); assert.equal(o.fetches,1);
  assert.deepEqual(o.reservations,['TOKEN_REFRESH']); assert.equal(c.TMV3_RUNTIME_METRICS.strivenApiCalls,1);
});
test('unknown lifetime is not cached', () => {
  const {context:c, observed:o} = runtime({body:{access_token:'test-only-token'}});
  c.tmv3_token_(); assert.equal(o.cached.length,0);
});
test('budget denial prevents HTTP request', () => {
  const {context:c, observed:o} = runtime({block:true});
  assert.throws(() => c.tmv3_token_(),/budget blocked/); assert.equal(o.fetches,0);
  assert.equal(c.TMV3_RUNTIME_METRICS.strivenApiCalls,0);
});
test('authentication failure is counted and not cached', () => {
  const {context:c, observed:o} = runtime({status:401});
  assert.throws(() => c.tmv3_token_(),/HTTP 401/); assert.equal(o.cached.length,0);
  assert.equal(c.TMV3_RUNTIME_METRICS.strivenApiCalls,1); assert.equal(c.TMV3_RUNTIME_METRICS.strivenApiFailures,1);
});
test('missing access token fails without caching', () => {
  const {context:c, observed:o} = runtime({body:{expires_in:86400}});
  assert.throws(() => c.tmv3_token_(),/no access_token/); assert.equal(o.cached.length,0);
});
console.log(passed + ' tests passed');
