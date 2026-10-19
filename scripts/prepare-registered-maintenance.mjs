import fs from 'node:fs';
import path from 'node:path';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {maintenanceBrands} from '../crawler/common/registered-maintenance.js';
const root=path.resolve(import.meta.dirname,'..'),brand=process.argv[2];
if(!maintenanceBrands.includes(brand)||process.env.LUXURY_WEEKLY_MAINTENANCE!=='enabled'||process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER)throw Error('MAINTENANCE_COORDINATOR_REQUIRED');
const codes=[];
for(let offset=0;offset<10000;offset+=100){
 const endpoint='product_variants?brands.slug=eq.'+brand+'&select=normalized_code,brands!inner(slug),market_products(country_code,currency_code,official_product_code),product_media(is_primary,r2_object_key)&order=normalized_code.asc&limit=100&offset='+offset;
 const a=guardedRest(endpoint),b=guardedRest(endpoint,'GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY??process.env.SUPABASE_ANON_KEY);
 if(JSON.stringify(a)!==JSON.stringify(b))throw Error('MAINTENANCE_PUBLIC_BASELINE');
 for(const v of a){if(v.brands.slug!==brand||!v.market_products.some(m=>m.country_code==='KR'&&m.currency_code==='KRW'&&m.official_product_code===v.normalized_code)||!v.product_media.some(m=>m.is_primary&&m.r2_object_key))throw Error('MAINTENANCE_REFERENCE_INVALID');codes.push(v.normalized_code);}
 if(a.length<100)break;
 if(offset===9900)throw Error('MAINTENANCE_REFERENCE_LIMIT');
}
const dir=root+'/crawler/runtime/registered-maintenance';fs.mkdirSync(dir,{recursive:true});
const file=dir+'/'+brand+'.json';fs.writeFileSync(file+'.tmp',JSON.stringify({schema:1,brand,checkedAt:new Date().toISOString(),codes}),{mode:0o600});fs.renameSync(file+'.tmp',file);
