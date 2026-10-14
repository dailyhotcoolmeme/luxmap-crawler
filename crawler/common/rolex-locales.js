import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {referenceCode} from './jewelry-watch-product.js';
export async function discoverRolexLocales(cfg){
 if(process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_PIPELINE_GUARD!=='enabled')throw Error('GUARDED_RUN_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR;
 const index=JSON.parse(await fs.readFile(path.join(root,'crawler/brands/rolex/.reference-index.json'))),url=index.urls[0],code=referenceCode(url,'rolex').replace(/[^a-z0-9]/gi,'').toUpperCase();
 const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000}),rows=[];
 const row=(status,address=url)=>({brand:'rolex',country:'KR',parentModel:'한국 SKU 공식 해외 연결 조사',variantCode:code,price:null,currency:'',status,officialUrl:address});
 try{
  const r=await client.get(url,{maxRedirects:0});if(!r.ok())throw Error([403,429].includes(r.status())?'ACCESS_BLOCKED':`HTTP_${r.status()}`);
  const bytes=await r.body();if(bytes.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');await fs.writeFile(path.join(run,'raw','1.source'),bytes,{mode:0o600});
  const seen=new Set();
  for(const tag of bytes.toString('utf8').matchAll(/<(?:link|a)\b[^>]*>/gi)){
   const href=tag[0].match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];if(!href)continue;
   let u;try{u=new URL(href.replaceAll('&amp;','&'),url);}catch{continue;}
   if(u.protocol!=='https:'||u.hostname!=='www.rolex.com'||u.username||u.password||referenceCode(u.href,'rolex')?.replace(/[^a-z0-9]/gi,'').toUpperCase()!==code||seen.has(u.href))continue;
   seen.add(u.href);rows.push(row('OFFICIAL_LOCALIZED_SKU_LINK',u.href));
  }
  rows.push(row(`LOCALES_DISCOVERED_${seen.size}`));
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'LOCALE_DISCOVERY_FAILED'));process.exitCode=1;}
 finally{await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});await client.dispose();}
}
