function tm2_executePlan_() {
  throw new Error(
    'TM2 executor is intentionally disabled in SHADOW_READ_ONLY. ' +
    'No Striven mutation is permitted in TM2 R0.'
  );
}
