function tm2_reportCapabilitySnapshot_() {
  tm2_assertShadowSafe_();
  const candidates = [
    'runDailyBigDataRefresh',
    'runAllDivisionsRefreshRebuildOnly',
    'syncStrivenTasksToSheet',
    'syncStrivenDeliveryTasksToSheet',
    'syncStrivenServiceTasksToSheet',
    'syncStrivenServiceWorkOrdersToSheet'
  ];
  const result = {};
  candidates.forEach(function(name) {
    result[name] = tm2_hasFunction_(name);
  });
  return {
    status: TM2_ENDPOINT.SHADOW_ONLY,
    capabilities: result,
    externalCallsPerformed: 0
  };
}
