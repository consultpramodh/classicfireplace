function tm2_getWorkflowProfile_(workflow) {
  const name = tm2_clean_(workflow);

  const profiles = {
    Install: {
      workflow: 'Install',
      mappingSheet: (typeof INSTALL_CONFIG !== 'undefined' &&
        INSTALL_CONFIG.SHEETS && INSTALL_CONFIG.SHEETS.MAPPING) ?
        INSTALL_CONFIG.SHEETS.MAPPING : 'Install Task Mapping'
    },
    Delivery: {
      workflow: 'Delivery',
      mappingSheet: (typeof DELIVERY_CONFIG !== 'undefined' &&
        DELIVERY_CONFIG.SHEETS && DELIVERY_CONFIG.SHEETS.MAPPING) ?
        DELIVERY_CONFIG.SHEETS.MAPPING : 'Delivery Task Mapping'
    },
    Service: {
      workflow: 'Service',
      mappingSheet: (typeof SERVICE_CONFIG !== 'undefined' &&
        SERVICE_CONFIG.SHEETS && SERVICE_CONFIG.SHEETS.MAPPING) ?
        SERVICE_CONFIG.SHEETS.MAPPING : 'Service Task Mapping'
    },
    PreInspection: {
      workflow: 'PreInspection',
      mappingSheet: 'PreInspect Task Mapping'
    }
  };

  if (!profiles[name]) throw new Error('Unknown TM2 workflow: ' + name);
  return profiles[name];
}
