function tmv3_assertPreInspectionLinkDescription_(description, plan) {
  const text = String(description || '');
  const headings = text.match(/Striven\s+Links/gi) || [];
  if (headings.length !== 1 || /Pre[- ]Inspection\s+Task\s+Link/i.test(text) ||
      /PREINSPECT_STRIVEN_TASK_LINK_(?:START|END)/i.test(text)) {
    throw new Error('PREINSPECTION_LINK_SECTION_NOT_UNIQUE');
  }
  (plan.links || []).forEach(function(link) {
    const url = tmv3_regexEscape_(tmv3_calendarHtmlEscape_(String(link.url || '')));
    if (!url) throw new Error('PREINSPECTION_LINK_URL_EMPTY');
    const anchors = text.match(new RegExp('<a\\b[^>]*href=["\\\']' + url + '["\\\'][^>]*>[\\s\\S]*?<\\/a>', 'gi')) || [];
    if (anchors.length !== 1) throw new Error('PREINSPECTION_LINK_NOT_UNIQUE: ' + link.key);
    const label = anchors[0].replace(/^[\s\S]*?>/, '').replace(/<\/a>$/i, '');
    if (label !== tmv3_calendarHtmlEscape_(String(link.label || ''))) {
      throw new Error('PREINSPECTION_LINK_LABEL_MISMATCH: ' + link.key);
    }
    // Reject raw/Markdown copies outside the single expected anchor as well.
    if (text.replace(anchors[0], '').indexOf(String(link.url || '')) >= 0) {
      throw new Error('PREINSPECTION_DUPLICATE_RAW_LINK: ' + link.key);
    }
  });
  return true;
}

