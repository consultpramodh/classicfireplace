function tmv3_operationWritesEnabled_(scope) {
  const policy = tmv3_operationPolicy_();
  const mode = tmv3_norm_(scope || '');
  const externalWriteMode =
    TMV3.MODE === 'CANARY_WRITE' ||
    TMV3.MODE === 'PRODUCTION_WRITE';

  // A policy flag may narrow an authorized write mode, but it must never
  // elevate SHADOW_READ_ONLY into a write-capable mode.
  if (!externalWriteMode) return false;

  if (mode === 'preinspectionauto') {
    return TMV3.MODE === 'PRODUCTION_WRITE' &&
      policy.preInspectionAutomationEnabled === true &&
      policy.automationWritesEnabled === false &&
      policy.manualWritesEnabled === false;
  }

  if (mode === 'servicedeliverydetails') {
    const context = typeof tmv3_taskFirstProductionCycle_ === 'function' &&
      tmv3_taskFirstProductionCycle_.detailContext;
    return TMV3.MODE === 'PRODUCTION_WRITE' &&
      policy.taskFirstProductionEnabled === true &&
      policy.manualWritesEnabled === false && policy.automationWritesEnabled === false &&
      Number(policy.taskFirstProductionMaxWritesPerRun) === 1 && !!context &&
      (context.vertical === 'Service' || context.vertical === 'Delivery');
  }

  // The dedicated production permission cannot unlock legacy/manual/calendar writers.
  if (mode === 'taskfirstproduction') {
    return TMV3.MODE === 'PRODUCTION_WRITE' &&
      policy.taskFirstProductionEnabled === true &&
      policy.manualWritesEnabled === false &&
      policy.automationWritesEnabled === false &&
      Number(policy.taskFirstProductionMaxWritesPerRun) === 1;
  }

  if (mode === 'taskfirstcanary19083') {
    return TMV3.MODE === 'CANARY_WRITE' &&
      policy.taskFirstCanaryEnabled === true &&
      Number(policy.taskFirstCanaryTaskId) === 19083 &&
      policy.manualWritesEnabled === false &&
      policy.automationWritesEnabled === false;
  }

  if (mode === 'manual') {
    return policy.manualWritesEnabled === true;
  }

  if (mode === 'auto') {
    return policy.automationWritesEnabled === true;
  }

  return false;
}
