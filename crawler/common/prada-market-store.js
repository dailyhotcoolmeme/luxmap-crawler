export function coverageFailure(rows,discoveryMissing=0){
 if(!rows.length||discoveryMissing||rows.some(row=>row.status==='unprocessed'))return 'INCOMPLETE_COVERAGE';
 if(!rows.some(row=>row.status==='confirmed'&&Number(row.price)>0))return 'ALL_PRICES_UNAVAILABLE';
 return null;
}
export async function storePradaMarkets(rows,config,query){
 const vanCleef=config.brand==='van-cleef-arpels';
 const brandName=vanCleef?'VAN CLEEF & ARPELS':'PRADA';
 const prefix=vanCleef?`/${config.country.toLowerCase()}/`:config.referenceDetailPrefix;
 const pattern=vanCleef?config.productPathPattern:config.detailPathPattern;
 const origin=vanCleef?'https://www.vancleefarpels.com':'https://www.prada.com';
 if(!Array.isArray(rows)||!rows.length||rows.length>100)throw new Error('invalid batch');
 const codes=new Set();
 for(const row of rows){const url=new URL(row.officialUrl);const code=vanCleef?url.pathname.match(/\/(VC[A-Z0-9]{8})-[^/]+\.html$/i)?.[1].toUpperCase():decodeURIComponent(url.pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase();if(row.country!==config.country||row.currency!==config.currency||url.origin!==origin||!url.pathname.startsWith(prefix)||!new RegExp(pattern).test(url.pathname)||code!==row.normalizedCode||!/^[A-Z0-9]+$/.test(row.normalizedCode)||codes.has(row.normalizedCode)||!['confirmed','price_unavailable','page_not_found'].includes(row.priceStatus)||!Number.isFinite(Date.parse(row.checkedAt))||!(row.price===null||(Number.isFinite(row.price)&&row.price>0))||(row.price!==null&&row.priceStatus!=='confirmed'))throw new Error('invalid country record');codes.add(row.normalizedCode);}
 const variants=await query(`product_variants?normalized_code=in.(${[...codes].join(',')})&brands.name_original=eq.${encodeURIComponent(brandName)}&select=id,normalized_code,name_original,brands!inner(name_original)&limit=100`);
 const byCode=new Map(variants.map(row=>[row.normalized_code,row]));
 if(variants.length!==rows.length||byCode.size!==rows.length||variants.some(row=>row.brands?.name_original!==brandName))throw new Error('unmatched product code');
 const ids=variants.map(row=>row.id).join(',');
 const korean=await query(`market_products?variant_id=in.(${ids})&country_code=eq.KR&select=variant_id,official_product_code&limit=100`);
 if(korean.length!==rows.length||new Set(korean.map(row=>row.variant_id)).size!==rows.length||korean.some(row=>!variants.some(v=>v.id===row.variant_id&&v.normalized_code===row.official_product_code)))throw new Error('Korean reference missing');
 const old=await query(`market_products?variant_id=in.(${ids})&country_code=eq.${config.country}&select=*&limit=100`);
 if(new Set(old.map(row=>row.variant_id)).size!==old.length)throw new Error('duplicate market');
 const payload=rows.map(row=>{const variant=byCode.get(row.normalizedCode),previous=old.find(item=>item.variant_id===variant.id),preserve=row.price===null&&previous?.current_price!=null;return {variant_id:variant.id,country_code:config.country,currency_code:config.currency,official_product_code:row.normalizedCode,official_name:row.productName??`[한국 기준] ${variant.name_original}`,official_url:row.officialUrl,current_price:preserve?Number(previous.current_price):row.price,price_status:preserve?previous.price_status:row.priceStatus,price_checked_at:row.price!==null?row.checkedAt:previous?.price_checked_at??null,page_checked_at:row.checkedAt,first_seen_at:previous?.first_seen_at??row.checkedAt,last_seen_at:row.checkedAt};});
 const saved=await query('market_products?on_conflict=variant_id,country_code','POST',payload,'resolution=merge-duplicates,return=representation');
 if(saved.length!==rows.length)throw new Error('storage count mismatch');
 const histories=await query(`market_products?id=in.(${saved.map(row=>row.id).join(',')})&select=id,price_history(amount)&price_history.order=observed_at.desc&price_history.limit=1&limit=100`);
 const additions=[];for(const row of rows){if(row.price===null)continue;const market=saved.find(item=>item.variant_id===byCode.get(row.normalizedCode).id),history=histories.find(item=>item.id===market.id)?.price_history?.[0];if(!history||Number(history.amount)!==row.price)additions.push({market_product_id:market.id,amount:row.price,currency_code:config.currency,observed_at:row.checkedAt,source_url:row.officialUrl});}
 if(additions.length)await query('price_history','POST',additions);
 const actual=await query(`market_products?variant_id=in.(${ids})&country_code=eq.${config.country}&select=*&limit=100`);
 if(actual.length!==rows.length||payload.some(expected=>{const row=actual.find(item=>item.variant_id===expected.variant_id);return !row||row.official_product_code!==expected.official_product_code||row.currency_code!==expected.currency_code||row.official_url!==expected.official_url||row.price_status!==expected.price_status||(row.current_price===null?null:Number(row.current_price))!==expected.current_price;}))throw new Error('verification failed');
 return rows.length;
}
