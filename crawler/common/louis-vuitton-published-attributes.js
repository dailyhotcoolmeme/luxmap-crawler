import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {louisVuittonCode,louisVuittonJson,louisVuittonAccess} from './louis-vuitton-product.js';
export async function collectLouisVuittonPublishedAttributes(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),cfg=JSON.parse(await fs.readFile(process.argv[3])),run=process.env.CRAWL_RUN_DIR,folder=root+'/crawler/completeness/louis-vuitton/published-alternates';
 if(!['US','JP'].includes(cfg.country)||cfg.brand!=='louis-vuitton'||spawnSync(root+'/scripts/crawl-output-guard.sh',[folder+'/summary.json'],{stdio:'ignore'}).status)throw Error('COUNTRY_SOURCE_GUARD');
 const all=JSON.parse(await fs.readFile(folder+'/links.json')).filter(r=>r.country===cfg.country),base=root+'/crawler/runs/louis-vuitton/'+cfg.country.toLowerCase(),done=new Set();await fs.mkdir(base,{recursive:true});
 for(const id of await fs.readdir(base)){const file=base+'/'+id+'/summary.json';try{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(await fs.readFile(file)))if(['EXACT_SKU_URL','OFFICIAL_ATTRIBUTE_SOURCE_SAVED'].includes(r.status))done.add(r.variantCode);}catch{}}
 const pending=all.filter(r=>!done.has(r.code)).slice(0,cfg.maxProductsPerRun),rows=[];let current=cfg.entryUrl,active='SOURCE',calls=0;
 const row=(status,price=null)=>({brand:cfg.brand,country:cfg.country,parentModel:'한국 동일 SKU 공식 상세 속성',variantCode:active,price,currency:cfg.currency,status,officialUrl:current});
 const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
 try{for(const target of pending){current=target.url;active=target.code;const u=new URL(current);if(!cfg.allowedHosts.includes(u.hostname)||!u.pathname.startsWith(cfg.localePrefix)||louisVuittonCode(current)!==active||louisVuittonCode(target.sourceUrl)!==active)throw Error('REFERENCE_IDENTITY');if(calls)await new Promise(r=>setTimeout(r,2000));
   const response=await client.get(current,{maxRedirects:0});if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error('SOURCE_HTTP_FAILED');const body=await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');const text=body.toString('utf8');louisVuittonAccess(text,response.status());
   await fs.writeFile(run+'/raw/'+(++calls)+'.source',body,{mode:0o600});
   const products=louisVuittonJson(text).filter(p=>[p['@type']].flat().includes('Product')&&p.sku===active);if(products.length!==1){rows.push(row('HTML_NUXT_'+Number(/__NUXT__|__NUXT_DATA__/.test(text))),row('HTML_EXACT_REF_'+Number(text.includes(active))));throw Error('EXACT_SKU_UNVERIFIED');}const prices=[...new Set([products[0].offers].flat().filter(o=>o?.priceCurrency===cfg.currency&&Number(o.price)>0).map(o=>Number(o.price)))];if(prices.length!==1)throw Error('COUNTRY_PRICE_UNVERIFIED');
   rows.push(row('OFFICIAL_ATTRIBUTE_SOURCE_SAVED',prices[0]));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
  }rows.push(row('PENDING_ATTRIBUTES_'+(all.length-done.size-pending.length)));
 }catch(error){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'ATTRIBUTE_SOURCE_FAILED'));process.exitCode=1;}
 finally{await client.dispose();await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
}
