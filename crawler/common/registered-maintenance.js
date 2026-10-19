import fs from 'node:fs';
import path from 'node:path';
export const maintenanceBrands=['chanel','prada','bottega-veneta','rolex','van-cleef-arpels','louis-vuitton','dior'];
export function maintenanceManifest(){
 const file=process.env.LUXURY_REGISTERED_MANIFEST;
 if(!file)return null;
 const root=path.resolve(import.meta.dirname,'../..'),brand=process.env.CRAWL_BRAND??process.env.LUXURY_INGEST_BRAND;
 if(!maintenanceBrands.includes(brand)||file!==root+'/crawler/runtime/registered-maintenance/'+brand+'.json')throw Error('MAINTENANCE_MANIFEST_SCOPE');
 const st=fs.lstatSync(file),m=JSON.parse(fs.readFileSync(file));
 if(!st.isFile()||st.isSymbolicLink()||st.size>4*1024*1024||m.brand!==brand||m.schema!==1||!Number.isFinite(Date.parse(m.checkedAt))||Math.abs(Date.now()-Date.parse(m.checkedAt))>3600000||!Array.isArray(m.codes)||new Set(m.codes).size!==m.codes.length||m.codes.some(c=>!/^[A-Z0-9]+$/.test(c)))throw Error('MAINTENANCE_MANIFEST_INVALID');
 return m;
}
export function registeredPriceOnly(code){
 const m=maintenanceManifest();return !!m&&typeof code==='string'&&m.codes.includes(code);
}
export function partitionMaintenanceRecords(records,manifest){
 if(!Array.isArray(records)||records.length>25)throw Error('MAINTENANCE_BATCH_LIMIT');
 const known=new Set(manifest.codes),prices=[],fresh=[];
 for(const r of records){
  if(r.brand&&r.brand!==manifest.brand||r.country!=='KR'||r.currency!=='KRW'||typeof r.normalizedCode!=='string')throw Error('MAINTENANCE_RECORD_SCOPE');
  if(known.has(r.normalizedCode))prices.push(r);
  else {if(r.maintenancePriceOnly)throw Error('NEW_REFERENCE_IMAGE_REQUIRED');fresh.push(r);}
 }
 return {prices,fresh};
}
export async function storeRegisteredPrices(records,brand,query){
 if(!maintenanceBrands.includes(brand)||!records.length||records.length>25||new Set(records.map(r=>r.normalizedCode)).size!==records.length)throw Error('MAINTENANCE_BATCH_LIMIT');
 for(const r of records)if(r.country!=='KR'||r.currency!=='KRW'||!/^[A-Z0-9]+$/.test(r.normalizedCode)||!(r.price===null&&['price_unavailable','parse_failed'].includes(r.priceStatus)||Number.isFinite(r.price)&&r.price>0&&r.priceStatus==='confirmed')||!Number.isFinite(Date.parse(r.checkedAt))||Date.parse(r.checkedAt)>Date.now()+60000||Date.now()-Date.parse(r.checkedAt)>3600000)throw Error('MAINTENANCE_PRICE_INVALID');
 const endpoint='product_variants?brands.slug=eq.'+brand+'&normalized_code=in.('+records.map(r=>r.normalizedCode).join(',')+')&select=*,brands!inner(slug),product_models(*),market_products(*),product_media(*)&order=normalized_code.asc&limit=25';
 const before=await query(endpoint),publicBefore=await query(endpoint,'GET',undefined,true);
 if(JSON.stringify(before)!==JSON.stringify(publicBefore)||before.length!==records.length)throw Error('MAINTENANCE_PUBLIC_BASELINE');
 const histories=[],expected=new Map(),prepared=[];let changed=0;
 for(const r of records){
  const v=before.find(v=>v.normalized_code===r.normalizedCode),markets=v?.market_products.filter(m=>m.country_code==='KR'),m=markets?.[0],u=new URL(r.officialUrl);
  if(!v||v.brands.slug!==brand||markets.length!==1||m.official_product_code!==r.normalizedCode||m.currency_code!=='KRW'||m.official_url!==r.officialUrl||u.protocol!=='https:'||u.username||u.password||u.hash||!v.product_media.some(p=>p.is_primary&&p.r2_object_key))throw Error('MAINTENANCE_EXACT_REFERENCE');
  prepared.push({r,v,m});
 }
 for(const {r,v,m} of prepared){
  if(r.price===null||m.price_checked_at&&Date.parse(m.price_checked_at)>Date.parse(r.checkedAt)){expected.set(v.id,m);continue;}
  const patch={current_price:r.price,price_status:'confirmed',price_checked_at:r.checkedAt,page_checked_at:r.checkedAt,last_seen_at:r.checkedAt};
  const saved=await query('market_products?id=eq.'+m.id+'&variant_id=eq.'+v.id+'&country_code=eq.KR','PATCH',patch);
  if(saved.length!==1||saved[0].id!==m.id||Object.keys(patch).some(k=>saved[0][k]!==patch[k]))throw Error('MAINTENANCE_PRICE_WRITE');
  if(Number(m.current_price)!==r.price)changed++;
  expected.set(v.id,{...m,...patch});histories.push({market_product_id:m.id,amount:r.price,currency_code:'KRW',observed_at:r.checkedAt,source_url:r.officialUrl});
 }
 if(histories.length){
  const historyEndpoint='market_products?id=in.('+histories.map(h=>h.market_product_id).join(',')+')&select=id,price_history(amount,currency_code)&price_history.order=observed_at.desc&price_history.limit=1&limit=25';
  const old=await query(historyEndpoint),add=histories.filter(h=>{const p=old.find(m=>m.id===h.market_product_id)?.price_history?.[0];return !p||Number(p.amount)!==h.amount||p.currency_code!==h.currency_code;});
  if(add.length)await query('price_history','POST',add);
  const published=await query(historyEndpoint,'GET',undefined,true);
  if(published.length!==histories.length||histories.some(h=>{const p=published.find(m=>m.id===h.market_product_id)?.price_history?.[0];return !p||Number(p.amount)!==h.amount||p.currency_code!=='KRW';}))throw Error('MAINTENANCE_PUBLIC_HISTORY');
 }
 const after=await query(endpoint),publicAfter=await query(endpoint,'GET',undefined,true);
 if(JSON.stringify(after)!==JSON.stringify(publicAfter)||after.length!==before.length)throw Error('MAINTENANCE_PUBLIC_AFTER');
 for(const old of before){const actual=after.find(v=>v.id===old.id),want={...old,market_products:old.market_products.map(m=>m.country_code==='KR'?expected.get(old.id):m)};
  // DB-managed updated_at may advance on the price market only. No other
  // field of variants/models/media/foreign markets may change.
  const clean=v=>({...v,market_products:v.market_products.map(m=>{const c={...m};if(c.country_code==='KR')delete c.updated_at;return c;}).sort((a,b)=>a.id.localeCompare(b.id))});
  if(JSON.stringify(clean(actual))!==JSON.stringify(clean(want)))throw Error('MAINTENANCE_NONPRICE_CHANGED');
 }
 return {changed,unchanged:records.length-changed,verified:prepared.map(({r,v,m})=>({...r,publicPrice:expected.get(v.id).current_price,status:r.price===null?'REGISTERED_PRICE_UNCONFIRMED':m.price_checked_at&&Date.parse(m.price_checked_at)>Date.parse(r.checkedAt)?'REGISTERED_NEWER_PRICE_PRESERVED':'REGISTERED_PRICE_PUBLIC_VERIFIED'}))};
}
