import json, pathlib, re
root = pathlib.Path('.')
src = root / 'apps-script/tmv3-clean'

config_path = src / '00_Config.js'
config = config_path.read_text()
config = re.sub(
    r"const TMV3_VERSION = '[^']+';",
    "const TMV3_VERSION = '3.1.0-parity-r1-manual-live-auto-gated';",
    config,
    count=1,
)
if 'OPERATIONS: Object.freeze({' not in config:
    anchor = "  MAX_PAGES: 50,\n"
    block = (
        "  MAX_PAGES: 50,\n"
        "  OPERATIONS: Object.freeze({\n"
        "    manualWritesEnabled: true,\n"
        "    automationWritesEnabled: false,\n"
        "    autoMaxWritesPerRun: 10,\n"
        "    installRemindersEnabled: true\n"
        "  }),\n"
    )
    if anchor not in config:
        raise SystemExit('MAX_PAGES config anchor not found')
    config = config.replace(anchor, block, 1)
config = config.replace(
    "field854Policy: 'NO_WRITE'",
    "field854Policy: 'MANAGED_WRITE_PRESERVE_OTHER_FIELDS'",
)
config_path.write_text(config)

morning_path = src / '80_MorningOps.js'
morning = morning_path.read_text()
replacement = r'''function tmv3_triggerHealth_() {
  const installed = tmv3_listTriggers();

  const expectedCounts = {
    tmv3_dailySourceRefresh: 1,
    tmv3_scheduledOperations: 5,
    tmv3_refreshLinksSlot_0800: 1,
    tmv3_refreshLinksSlot_1000: 1,
    tmv3_refreshLinksSlot_1200: 1,
    tmv3_refreshLinksSlot_1400: 1,
    tmv3_refreshLinksSlot_1600: 1,
    tmv3_refreshLinksSlot_1800: 1,
    tmv3_installReminderCheck: 1,
    tmv3_calendarEventUpdated: 4
  };

  const actualCounts = {};
  installed.forEach(function(t) {
    const handler = tmv3_clean_(t.handler);
    actualCounts[handler] = (actualCounts[handler] || 0) + 1;
  });

  const missing = [];
  const extra = [];

  Object.keys(expectedCounts).forEach(function(handler) {
    const expected = expectedCounts[handler];
    const actual = actualCounts[handler] || 0;
    if (actual < expected) {
      missing.push(handler + ' ' + actual + '/' + expected);
    } else if (actual > expected) {
      extra.push(handler + ' ' + actual + '/' + expected);
    }
  });

  return {
    installed: installed.length,
    missing: missing,
    duplicates: extra,
    enabled: Object.keys(actualCounts).some(function(handler) {
      return expectedCounts[handler] !== undefined;
    }),
    expectedCount: 17,
    manualWritesEnabled:
      !!(TMV3.OPERATIONS && TMV3.OPERATIONS.manualWritesEnabled),
    automationWritesEnabled:
      !!(TMV3.OPERATIONS && TMV3.OPERATIONS.automationWritesEnabled)
  };
}

'''
pattern = re.compile(
    r'function tmv3_triggerHealth_\(\) \{[\s\S]*?\n\}\n\nfunction tmv3_morningReadiness_',
    re.M,
)
m = pattern.search(morning)
if not m:
    raise SystemExit('tmv3_triggerHealth_ anchor not found')
morning = morning[:m.start()] + replacement + 'function tmv3_morningReadiness_' + morning[m.end():]
morning_path.write_text(morning)

manifest_path = root / 'release-candidates/tmv3-clean-bootstrap.json'
manifest = json.loads(manifest_path.read_text())
manifest['release'] = 'TMV3_FEATURE_PARITY_R1_MANUAL_LIVE_AUTO_GATED'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
