function tm2_strivenRead_() {
  throw new Error(
    'TM2 direct Striven client is not enabled in R0. ' +
    'Shadow R0 uses existing sheet projections only.'
  );
}

function tm2_strivenWrite_() {
  throw new Error('TM2 Striven writes are disabled in SHADOW_READ_ONLY.');
}
