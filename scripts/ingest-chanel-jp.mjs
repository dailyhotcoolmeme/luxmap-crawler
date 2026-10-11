#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
if(process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw new Error('guard required');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw new Error('missing credential');
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const country=(process.argv[3]||'JP').toUpperCase();
if(!/^[A-Z]{2}$/.test(country)||country==='KR')throw new Error('invalid foreign country');
const config=JSON.parse(fs.readFileSync(new URL(`../crawler/brands/chanel/countries/${country.toLowerCase()}`,import.meta.url)));
const currency=config.currency;
if(config.country!==country||!currency||!config.referenceDetailPrefix)throw new Error('country configuration required');
const query=(endpoint,method='GET',body)=>{
 const args=['-fsS','--max-time','30','-X',method,'-H',`apikey: ${key}`,'-H',`Authorization: Bearer ${key}`,'-H','Content-Type: application/json','-H','Prefer: return=representation'];
 if(body)args.push('--data',JSON.stringify(body));
 args.push('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+endpoint);
 return JSON.parse(execFileSync('curl',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:1048576}));
};
// Prevalidate the entire batch before writes; never create unmatched variants.
const matched=rows.map(row=>{
 const url=new URL(row.officialUrl);
 if(row.country!==country||row.currency!==currency||url.origin!=='https://www.chanel.com'||!url.pathname.startsWith(config.referenceDetailPrefix)||!new RegExp(config.detailPathPattern).test(url.pathname))throw new Error('invalid country record');
 const variants=query(`product_variants?normalized_code=eq.${encodeURIComponent(row.normalizedCode)}&brands.name_original=eq.CHANEL&select=id,brands!inner(name_original)&limit=2`);
 if(variants.length!==1||String(variants[0].brands?.name_original).toLowerCase()!=='chanel')throw new Error('unmatched product code');
 const variant=variants[0].id;
 if(query(`market_products?variant_id=eq.${variant}&country_code=eq.KR&select=id`).length!==1)throw new Error('Korean reference missing');
 return {row,variant};
});
for(const {row,variant} of matched){
 const old=query(`market_products?variant_id=eq.${variant}&country_code=eq.${country}&limit=2`);
 if(old.length>1)throw new Error('duplicate market');
 const payload={variant_id:variant,country_code:country,currency_code:currency,official_product_code:row.normalizedCode,official_name:row.productName,official_url:row.officialUrl,current_price:row.price,price_status:row.priceStatus,page_checked_at:row.checkedAt,last_seen_at:row.checkedAt};
 if(row.price!==null)payload.price_checked_at=row.checkedAt;
 // Do not erase a previously confirmed price on an unconfirmed observation.
 if(old[0]?.current_price!=null&&row.price===null){delete payload.current_price;delete payload.price_status;}
 let saved;
 if(old.length){const delta=Object.fromEntries(Object.entries(payload).filter(([k,v])=>old[0][k]!==v));saved=Object.keys(delta).length?query(`market_products?id=eq.${old[0].id}`,'PATCH',delta)[0]:old[0];}
 else saved=query('market_products','POST',{...payload,first_seen_at:row.checkedAt})[0];
 if(row.price!==null){const history=query(`price_history?market_product_id=eq.${saved.id}&select=amount&order=observed_at.desc&limit=1`);if(Number(history[0]?.amount)!==row.price)query('price_history','POST',{market_product_id:saved.id,amount:row.price,currency_code:currency,observed_at:row.checkedAt,source_url:row.officialUrl});}
 const verify=query(`market_products?id=eq.${saved.id}&limit=1`)[0];
 if(verify.variant_id!==variant||verify.currency_code!==currency||(row.price!==null&&Number(verify.current_price)!==row.price))throw new Error('verification failed');
}
console.log(JSON.stringify({status:'stored_and_verified',records:matched.length}));
