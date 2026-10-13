export function validBottegaMarket(m, code, cfg, target, allowUnavailable=false) {
 try {
  const u=new URL(m.official_url),p=decodeURIComponent(u.pathname).toUpperCase();
  return m.country_code===cfg.country && m.official_product_code===code && m.currency_code===cfg.currency && (Number(m.current_price)>0||(allowUnavailable&&m.current_price===null&&m.price_status==='price_unavailable')) && u.protocol==='https:' && !u.username && !u.password && u.hostname==='www.bottegaveneta.com' && u.pathname.startsWith(cfg.localePrefix) && (p.endsWith(`${code}.HTML`) || (/^\d{8,10}$/.test(target?.sourceProductId??'') && p.endsWith(`${target.sourceProductId}.HTML`)));
 }catch{return false;}
}
export function recordBottegaFailures(failures, rows) {
 for(const r of rows){if(r.status==='confirmed')failures.delete(r.variantCode);else failures.set(r.variantCode,r);}
 return failures;
}
export function missingBottegaMarkets(referenceCodes, variants, cfg, targets) {
 return [...referenceCodes].filter(code=>!variants.some(v=>v.normalized_code===code && v.market_products.filter(m=>m.country_code===cfg.country).length===1 && v.market_products.some(m=>validBottegaMarket(m,code,cfg,targets.get(code),true))));
}
export function recordedEmptyBottegaPriceBatch(records, rows, country) {
 const ordinary=new Set(['MANUFACTURER_REFERENCE_MISMATCH','EXACT_REFERENCE_UNPROVEN','COUNTRY_PRODUCT_MISSING','INVALID_PRICE','CANONICAL_COUNTRY_URL_MISSING','CANONICAL_REFERENCE_MISMATCH','PRODUCT_SCOPE_AMBIGUOUS','PRODUCT_SCOPE_MISSING','COUNTRY_DETAIL_FAILED','COUNTRY_API_PRICE_FAILED','SCHEMA_URL_MISMATCH','IMAGE_REFERENCE_MISMATCH','EXPECTED_API_JSON_MISSING','HTTP_404','HTTP_500','HTTP_502','HTTP_503','HTTP_504']);
 return Array.isArray(records)&&records.length===0&&Array.isArray(rows)&&rows.length>0&&rows.length<=25&&new Set(rows.map(r=>r.variantCode)).size===rows.length&&rows.every(r=>r.brand==='bottega-veneta'&&r.country===country&&/^[A-Z0-9]{15}$/.test(r.variantCode)&&r.price===null&&ordinary.has(r.status));
}
