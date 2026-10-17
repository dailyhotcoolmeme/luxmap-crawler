import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request,chromium} from 'playwright-core';
import {louisVuittonAccess,louisVuittonCode,louisVuittonFamilyUrl,louisVuittonJson,parseLouisVuittonProduct} from './louis-vuitton-product.js';
import {louisVuittonSerializedData} from '../../scripts/louis-vuitton-serialized-data.mjs';

export function louisVuittonForeignUrl(value,cfg,code){
 const u=new URL(value);if(u.origin!==new URL(cfg.entryUrl).origin||u.username||u.password||u.search||u.hash||!u.pathname.startsWith(cfg.localePrefix+(cfg.productSegment??'products')+'/')||louisVuittonCode(u.href)!==code)throw Error('FOREIGN_SKU_URL_MISMATCH');return u.href;
}
export function parseLouisVuittonForeign(html,url,cfg,code){
 louisVuittonAccess(html);url=louisVuittonForeignUrl(url,cfg,code);
 try{const record=parseLouisVuittonProduct(html,url,cfg,code,{handbagEvidence:true});if(record.price!==null)return record;}catch(e){if(!['PRODUCT_DATA_UNAVAILABLE','MANUFACTURER_REFERENCE_MISMATCH'].includes(e.message))throw e;}
 const values=[...louisVuittonJson(html)],seen=new WeakSet();let nodes=0;
 const walk=(v,depth=0)=>{if(++nodes>500000||depth>60)throw Error('METADATA_LIMIT');if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);if(!Array.isArray(v))values.push(v);for(const x of Object.values(v))walk(x,depth+1);};
 for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){const text=m[2].trim();if(/window\.__NUXT__\s*=/.test(text))for(const v of louisVuittonSerializedData(text))walk(v);else if(text.startsWith('{')||text.startsWith('[')){let data;try{data=JSON.parse(text);}catch{continue;}walk(data);}}
 const matches=[];
 for(const v of values){if(Array.isArray(v.model)||(v.sku??v.identifier??v.mpn)!==code)continue;const offer=v.offers?.priceSpecification??[v.offers].flat().find(o=>o?.priceCurrency===cfg.currency);if(!offer||offer.priceCurrency!==cfg.currency||!Number.isFinite(Number(offer.price))||Number(offer.price)<=0)continue;
  if(typeof v.url!=='string')continue;const published=new URL(v.url,url);if(published.origin!==new URL(url).origin||published.search||published.hash||![url,louisVuittonFamilyUrl(url)].includes(published.href))continue;
  matches.push({price:Number(offer.price),name:typeof v.name==='string'?v.name:code});
 }
 if(!matches.length)throw Error('EXACT_LOCAL_PRICE_UNAVAILABLE');if(new Set(matches.map(v=>v.price)).size!==1)throw Error('PRICE_CONFLICT');
 return {brand:'louis-vuitton',country:cfg.country,currency:cfg.currency,normalizedCode:code,originalCode:code,productName:matches[0].name,price:matches[0].price,priceStatus:'confirmed',officialUrl:url,checkedAt:new Date().toISOString(),sourceImageUrl:null};
}
export async function collectLouisVuittonForeign(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),args=process.argv.slice(2),cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR;
 const rendered=args[2]==='--foreign-prices-browser';
 if(args.length!==5||!['--foreign-prices','--foreign-prices-browser'].includes(args[2])||args[3]!=='--targets-file'||cfg.country==='KR'||cfg.brand!=='louis-vuitton')throw Error('FOREIGN_SCOPE');
 const input=path.resolve(args[4]),country=cfg.country.toLowerCase();if(input!==root+'/crawler/louis-vuitton-progress/'+country+'/targets.json')throw Error('TARGET_SCOPE');
 const targets=JSON.parse(await fs.readFile(input));if(!Array.isArray(targets)||!targets.length||targets.length>Math.min(25,cfg.maxProductsPerRun)||new Set(targets.map(t=>t.code)).size!==targets.length)throw Error('TARGET_LIMIT');
 for(const t of targets){louisVuittonForeignUrl(t.url,cfg,t.code);
  if(t.sourceKind==='alternate'){const d=root+'/crawler/completeness/louis-vuitton/published-alternates';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[d+'/summary.json'],{stdio:'ignore'}).status)throw Error('ALTERNATE_SOURCE_GUARD');const p=JSON.parse(await fs.readFile(d+'/links.json'));if(!p.some(r=>r.code===t.code&&r.country===cfg.country&&r.url===t.url&&new URL(r.sourceUrl).origin==='https://kr.louisvuitton.com'&&louisVuittonCode(r.sourceUrl)===t.code))throw Error('ALTERNATE_SKU_MISMATCH');continue;}
  if(path.dirname(t.sourceRun)!==root+'/crawler/runs/louis-vuitton/'+country||spawnSync(root+'/scripts/crawl-output-guard.sh',[t.sourceRun+'/summary.json'],{stdio:'ignore'}).status)throw Error('SITEMAP_SOURCE_GUARD');
  if(t.sourceKind==='saved'){const proof=JSON.parse(await fs.readFile(t.sourceRun+'/summary.json'));if(t.savedFile!=='1.source'||!proof.some(r=>['EXACT_SKU_URL','NORMAL_COUNTRY_DOCUMENT_SAVED'].includes(r.status)&&r.officialUrl===t.url&&r.variantCode===t.code))throw Error('SAVED_SOURCE_GUARD');continue;}
  const published=JSON.parse(await fs.readFile(t.sourceRun+'/artifacts/discovery-candidates.json'));if(!published.includes(t.url))throw Error('PUBLISHED_URL_REQUIRED');}
 const rows=[],records=[],client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});let requests=0,failed=0,stop=false,page;
 if(rendered){if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CRAWL_CDP_URL??''))throw Error('MAINTAINED_BROWSER_REQUIRED');const browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL);page=browser.contexts()[0]?.pages()[0];if(!page)throw Error('MAINTAINED_PAGE_REQUIRED');}
 const row=(t,status,price=null)=>({brand:cfg.brand,country:cfg.country,parentModel:rendered?'한국 동일 SKU 해외 유지 브라우저':'한국 동일 SKU 해외 공식 가격',variantCode:t?.code??'RUN',price,currency:cfg.currency,status,officialUrl:t?.url??cfg.entryUrl});
 try{for(const t of targets){if(requests)await new Promise(r=>setTimeout(r,2000));try{
  if(t.sourceKind==='saved'){const file=t.sourceRun+'/raw/'+t.savedFile,stat=await fs.stat(file);if(stat.size>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');let text;try{await fs.chmod(file,0o600);text=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}const record=parseLouisVuittonForeign(text,t.url,cfg,t.code);record.checkedAt=stat.mtime.toISOString();records.push(record);rows.push(row(t,'SAVED_LOCAL_PRICE_CONFIRMED',record.price));continue;}
  if(++requests>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const response=page?await page.goto(t.url,{waitUntil:'domcontentloaded',timeout:cfg.navigationTimeoutMs}):await client.get(t.url,{maxRedirects:0});if(!response)throw Error('SOURCE_RESPONSE_MISSING');rows.push(row(t,'HTTP_'+response.status()));
  if(page)await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
  const body=page?Buffer.from(await page.content()):await response.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
  if(page&&/captcha-delivery|cf-chl|px-captcha|verify you are human/i.test(body.toString()))throw Error('SECURITY_VERIFICATION_REQUIRED');
  if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error('SOURCE_HTTP_FAILED');if(page&&louisVuittonForeignUrl(page.url(),cfg,t.code)!==t.url)throw Error('FOREIGN_SKU_URL_MISMATCH');louisVuittonAccess(body.toString(),response.status());await fs.writeFile(run+'/raw/'+requests+'.source',body,{mode:0o600});const record=parseLouisVuittonForeign(body.toString(),t.url,cfg,t.code);records.push(record);rows.push(row(t,'EXACT_LOCAL_PRICE_CONFIRMED',record.price));
 }catch(e){failed++;const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'FOREIGN_SOURCE_FAILED';rows.push(row(t,status));if(/ACCESS_BLOCKED|SECURITY_VERIFICATION|LIMIT|GUARD|MISMATCH|CONFLICT/.test(status)){stop=true;break;}}}}
 finally{await client.dispose();await fs.mkdir(run+'/artifacts',{recursive:true});await fs.writeFile(run+'/artifacts/records.json',JSON.stringify(records),{mode:0o600});rows.push(row(null,'BATCH_FAILED_'+failed),row(null,'NEXT_OFFSET_'+requests));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
 if(stop&&rows.some(r=>/SECURITY_VERIFICATION|LIMIT|GUARD|MISMATCH|CONFLICT/.test(r.status)))process.exitCode=78;else if(failed)process.exitCode=2;
 if(rendered)process.exit(process.exitCode??0);
}
