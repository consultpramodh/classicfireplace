function tm2_shadowRunWorkflow(workflow, maxRows) {
  tm2_assertShadowSafe_();

  const source = tm2_readMappingProjection_(workflow, maxRows || 100);
  if (source.status === TM2_ENDPOINT.BLOCKED) {
    tm2_log_('SHADOW_WORKFLOW_BLOCKED', source);
    return source;
  }

  const plans = [];
  for (let i = 0; i < source.rows.length; i++) {
    const record = tm2_buildShadowRecord_(workflow, source.headers, source.rows[i], source.headerRow + i + 1);
    plans.push({
      rowNumber: record.rowNumber,
      identity: record.identity,
      plan: tm2_planShadowRecord_(record),
      calendarLink: tm2_previewCalendarLink_(record)
    });
  }

  const counts = {};
  plans.forEach(function(x) {
    const key = x.plan.endpoint;
    counts[key] = (counts[key] || 0) + 1;
  });

  const result = {
    tm2Version: TM2_VERSION,
    mode: TM2_MODE.name,
    workflow: workflow,
    sourceSheet: source.sheetName,
    rowsInspected: plans.length,
    sourceTruncated: !!source.truncated,
    endpointCounts: counts,
    writeAttempts: 0,
    plans: plans
  };

  tm2_verifyNoWrites_(result);
  tm2_log_('SHADOW_WORKFLOW_COMPLETE', {
    workflow: workflow,
    rowsInspected: result.rowsInspected,
    endpointCounts: counts
  });
  return result;
}

function tm2_shadowInstall() {
  return tm2_shadowRunWorkflow('Install', 100);
}

function tm2_shadowDelivery() {
  return tm2_shadowRunWorkflow('Delivery', 100);
}

function tm2_shadowService() {
  return tm2_shadowRunWorkflow('Service', 100);
}

function tm2_shadowPreInspection() {
  return tm2_shadowRunWorkflow('PreInspection', 100);
}

function tm2_shadowRunAll() {
  tm2_assertShadowSafe_();
  return {
    tm2Version: TM2_VERSION,
    mode: TM2_MODE.name,
    Install: tm2_shadowInstall(),
    Delivery: tm2_shadowDelivery(),
    Service: tm2_shadowService(),
    PreInspection: tm2_shadowPreInspection(),
    writeAttempts: 0
  };
}
