const TM2_VERSION = 'TM2_SHADOW_R0_20260912';

const TM2_MODE = Object.freeze({
  name: 'SHADOW_READ_ONLY',
  writeEnabled: false,
  createRecreateEnabled: false,
  calendarWriteEnabled: false,
  triggerInstallEnabled: false
});

const TM2_ENDPOINT = Object.freeze({
  VERIFIED_COMPLETE: 'VERIFIED_COMPLETE',
  NO_CHANGE_VERIFIED: 'NO_CHANGE_VERIFIED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
  DEFERRED_RETRY: 'DEFERRED_RETRY',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
  UNCERTAIN_WRITE: 'UNCERTAIN_WRITE',
  TERMINAL_SKIP: 'TERMINAL_SKIP',
  SHADOW_ONLY: 'SHADOW_ONLY'
});

const TM2_WORKFLOWS = Object.freeze(['Install', 'Delivery', 'Service', 'PreInspection']);

const TM2_CUTOVER = Object.freeze({
  Install: false,
  Delivery: false,
  Service: false,
  PreInspection: false
});
