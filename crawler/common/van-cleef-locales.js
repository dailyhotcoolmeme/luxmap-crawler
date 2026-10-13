import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {referenceCode} from './jewelry-watch-product.js';
export async function discoverVanCleefLocales(config){
 const root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR;
 if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('GUARDED_RUN_REQUIRED');
 const index=JSON.parse(await fs.readFile(path.join(root,'crawler/brands/van-cleef-arpels/.reference-index.json'))),url=index.urls[0];
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});
 const rows=[],seen=new Set(),code=referenceCode(url,'van-cleef-arpels').toUpperCase();
 const row=(status,country,address)=>({brand:'van-cleef-arpels',country,parentModel:'한국 SKU 공식 국가 연결 조사',variantCode:code,price:null,currency:'',status,officialUrl:address});
 try{
  const r=await context.get(url,{maxRedirects:0});if(!r.ok())throw Error([403,429].includes(r.status())?'ACCESS_BLOCKED':`HTTP_${r.status()}`);
  const bytes=await r.body();if(bytes.length>config.maxResponseBytes)throw Error('RESPONSE_LIMIT');
  await fs.writeFile(path.join(run,'raw','1.source'),bytes,{mode:0o600});const html=bytes.toString('utf8');
  for(const tag of html.matchAll(/<(?:link|a)\b[^>]*>/gi)){
   const href=tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
   let target;try{target=new URL(href.replaceAll('&amp;','&'),url);}catch{continue;}
   const country=target.pathname.match(/^\/([a-z]{2})\/[a-z]{2}\//i)?.[1].toUpperCase();
   if(!['JP','FR','IT','ES','US','SG','HK'].includes(country)||target.protocol!=='https:'||target.hostname!=='www.vancleefarpels.com'||referenceCode(target.href,'van-cleef-arpels')?.toUpperCase()!==code||seen.has(country))continue;
   seen.add(country);rows.push(row('OFFICIAL_LOCALIZED_SKU_LINK',country,target.href));
  }
  rows.push(row(`LOCALES_DISCOVERED_${seen.size}`,'KR',url));
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'LOCALE_DISCOVERY_FAILED','KR',url));process.exitCode=1;}
 finally{await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});await context.dispose();}
}
