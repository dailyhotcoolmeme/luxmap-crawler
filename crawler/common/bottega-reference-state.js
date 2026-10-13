export const referenceStateKey='crawler-state/bottega-veneta/kr-v1.json';
const fields=['originalCode','normalizedCode','sourceProductId','styleCode','officialCategories','productName','colorDisplay','colorOriginal','materialDisplay','materialOriginal','widthMm','heightMm','depthMm','description','sourceImageUrl','price','priceStatus','officialUrl','country','currency','checkedAt','sourceMetadataMissing','modelKey','parentModel'];
export function referenceState(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>10000)throw Error('INVALID_REFERENCE_STATE');
 const codes=new Set();
 const records=rows.map(row=>{const r=Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])),u=new URL(r.officialUrl),image=new URL(r.sourceImageUrl);
  if(!/^[A-Z0-9]{15}$/.test(r.normalizedCode)||codes.has(r.normalizedCode)||(!/^\d{8,10}$/.test(r.sourceProductId)&&r.sourceProductId!==r.normalizedCode)||r.country!=='KR'||r.currency!=='KRW'||r.priceStatus!=='confirmed'||!(r.price>0)||!Number.isFinite(Date.parse(r.checkedAt))||u.protocol!=='https:'||u.hostname!=='www.bottegaveneta.com'||!u.pathname.startsWith('/ko-kr/')||u.username||u.password||image.protocol!=='https:'||image.hostname!=='bottega-veneta.dam.kering.com'||!r.officialCategories?.includes('Bags')||!r.modelKey||!r.parentModel||!r.productName||!r.colorDisplay)throw Error('INVALID_REFERENCE_STATE');
  const suffix=decodeURIComponent(u.pathname).toUpperCase();if(!suffix.endsWith(`${r.normalizedCode}.HTML`)&&!suffix.endsWith(`${r.sourceProductId}.HTML`))throw Error('INVALID_REFERENCE_STATE');
  codes.add(r.normalizedCode);return r;
 });return {version:1,brand:'bottega-veneta',country:'KR',records};
}
export function validateReferenceMarkets(state,variants){
 const rows=referenceState(state.records).records;
 if(state.version!==1||state.brand!=='bottega-veneta'||state.country!=='KR')throw Error('INVALID_REFERENCE_STATE');
 for(const r of rows){const v=variants.find(v=>v.normalized_code===r.normalizedCode),markets=v?.market_products?.filter(m=>m.country_code==='KR')??[];
  if(markets.length!==1||markets[0].official_product_code!==r.normalizedCode||markets[0].currency_code!=='KRW'||Number(markets[0].current_price)!==r.price||markets[0].official_url!==r.officialUrl)throw Error('REFERENCE_DB_MISMATCH');
 }return rows;
}
