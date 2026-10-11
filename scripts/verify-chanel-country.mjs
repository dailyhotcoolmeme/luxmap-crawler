import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const country=String(process.argv[2]??'').toUpperCase();
if(!/^[A-Z]{2}$/.test(country))throw new Error('invalid country');
const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/chanel/countries',country.toLowerCase())));
const currency=config.currency;
if(config.country!==country||!currency)throw new Error('country configuration required');
const rows=[];
const headers={apikey:process.env.EXPO_PUBLIC_SUPABASE_KEY,Authorization:`Bearer ${process.env.EXPO_PUBLIC_SUPABASE_KEY}`,'Cache-Control':'no-cache'};
for(let offset=0;;offset+=500){
 const url=new URL('/rest/v1/product_variants',process.env.EXPO_PUBLIC_SUPABASE_URL);
 url.search=new URLSearchParams({select:'normalized_code,brands(name_original),market_products(country_code,currency_code,current_price,official_url)',active:'eq.true',order:'normalized_code',limit:'500',offset:String(offset),last_seen_at:`gte.${new Date(Date.now()%86400000).toISOString()}`});
 const response=await fetch(url,{headers,cache:'no-store'});
 if(!response.ok)throw new Error('app catalog verification failed');
 const batch=await response.json();rows.push(...batch);if(batch.length<500)break;
}
const reference=rows.filter(r=>String(r.brands?.name_original).toLowerCase()==='chanel'&&r.market_products.some(m=>m.country_code==='KR'));
if(!reference.length)throw new Error('empty Korean app reference');
const summary=reference.map(r=>{
 const market=r.market_products.find(m=>m.country_code===country);
 if(market&&(market.currency_code!==currency||!market.official_url.startsWith(`https://www.chanel.com${config.referenceDetailPrefix}`)))throw new Error('invalid app country record');
 return {brand:'chanel',country,parentModel:'KR reference',variantCode:r.normalized_code,price:market?.current_price??null,currency,status:market?(market.current_price==null?'price_unavailable':'confirmed'):'unprocessed',officialUrl:market?.official_url??r.market_products.find(m=>m.country_code==='KR').official_url};
});
const dir=path.join(root,'crawler',`${country.toLowerCase()}-remaining`,'app-verification');
fs.mkdirSync(dir,{recursive:true});
const file=path.join(dir,'summary.json');
fs.writeFileSync(file,JSON.stringify(summary));
if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('app summary blocked');
