// Google Apps Script: retain valid per-vertical blocks; repair only managed links.
function tmv3_verticalClickableDescription_(description,plan) {
  const raw=String(description||''),links=plan.links||[];
  const heading=plan.vertical==='Install'?/------- Install Striven Task Link -------/:plan.vertical==='Delivery'?/------- Delivery Striven Links -------/:/------- Striven Links -------/;
  const correct=heading.test(raw) && links.length>0 && links.every(function(link){
    const esc=tmv3_regexEscape_(String(link.url));
    const rx=new RegExp('<a\\b[^>]*\\bhref=["\']'+esc+'["\'][^>]*>([\\s\\S]*?)<\\/a>','i');
    const m=rx.exec(raw);
    if(!m)return false;
    const label=tmv3_decodeCalendarHtmlEntities_(m[1].replace(/<[^>]*>/g,''));
    if(/^\s*(?:Task\s*#?\s*)?\d+\s*(?:[-–]\s*\d+)?\s*$/i.test(label))return false;
    return !/^TASK/.test(link.key)||label.indexOf(link.label.replace(/^.*?Task #\d+\s*[–-]\s*/,''))>=0;
  });
  if(correct)return raw;
  const authored=tmv3_stripManagedLinkBlocks_(raw),esc=tmv3_calendarHtmlEscape_;
  const anchor=function(link,label){return '<a href="'+esc(link.url)+'">'+esc(label||link.label)+'</a>';};
  const tasks=links.filter(function(l){return /^TASK/.test(l.key);});
  const order=links.filter(function(l){return l.key==='ORDER';})[0];
  const taskLines=tasks.map(function(l){return anchor(l,l.label.replace(/^(.*?Task #\d+)\s*–\s*/,'$1 - '));});
  let block;
  if(plan.vertical==='Install')block='------- Install Striven Task Link -------<br><br>'+taskLines.join('<br>')+'<br><br>------------------------------------';
  else if(plan.vertical==='Delivery')block='------- Delivery Striven Links -------<br><br>Sales Order<br>'+(order?anchor(order,order.label.replace(/^Sales Order\s*[–-]\s*/,'SO #')):'')+'<br><br>Delivery Task<br>'+taskLines.join('<br>')+'<br><br>------------------------------------';
  else block='------- Striven Links -------<br>'+(order?anchor(order,order.label.replace(/\s*[–-]\s*/,' #'))+'<br>':'')+taskLines.join('<br>')+'<br>------------------------------------';
  return (authored?authored+'<br><br>':'')+block;
}
