function tm2_connectivityAudit() {
  tm2_assertShadowSafe_();

  const requiredTm2Functions = [
    'tm2_shadowInstall',
    'tm2_shadowDelivery',
    'tm2_shadowService',
    'tm2_shadowPreInspection',
    'tm2_shadowRunAll',
    'tm2_diagnostics'
  ];

  const tm2Functions = {};
  requiredTm2Functions.forEach(function(name) {
    tm2Functions[name] = tm2_hasFunction_(name);
  });

  const legacyEntrypoints = [
    'runQuickInstallSync',
    'runDeliveryQuickSync',
    'runServiceQuickEndToEndPipeline',
    'runAllDivisionsRefreshRebuildOnly'
  ];

  const legacy = {};
  legacyEntrypoints.forEach(function(name) {
    legacy[name] = tm2_hasFunction_(name);
  });

  const result = {
    tm2Version: TM2_VERSION,
    mode: TM2_MODE.name,
    tm2Functions: tm2Functions,
    legacyEntrypointsObserved: legacy,
    cutoverFlags: TM2_CUTOVER,
    writeAttempts: 0
  };

  tm2_verifyNoWrites_(result);
  tm2_log_('CONNECTIVITY_AUDIT', result);
  return result;
}
