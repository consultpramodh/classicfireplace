function tm2_installTriggers() {
  throw new Error('TM2 trigger installation is disabled during shadow migration.');
}

function tm2_removeTriggersPreview() {
  return {
    endpoint: TM2_ENDPOINT.SHADOW_ONLY,
    action: 'NO_TRIGGER_MUTATION',
    triggerInstallEnabled: TM2_MODE.triggerInstallEnabled
  };
}
