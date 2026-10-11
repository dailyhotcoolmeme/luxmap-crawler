// Self-contained: Playwright serializes this function into the guarded page context.
export function productReady(expected, source=document) {
  const normalize=value=>String(value??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
  let ready=false;
  const visit=value=>{
    if(!value||typeof value!=='object')return;
    if([value['@type']].flat().includes('Product')&&normalize(value.sku)===expected)ready=true;
    Object.values(value).forEach(visit);
  };
  for(const script of source.querySelectorAll('script[type="application/ld+json"]')){
    try{visit(JSON.parse(script.textContent||'null'));}catch{}
  }
  return ready;
}
