import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {louisVuittonAccess,louisVuittonCode} from './louis-vuitton-product.js';
export async function renderLouisVuittonUS(){
 if(process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.CRAWL_MODE!=='deterministic-only')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR,cfg=JSON.parse(await fs.readFile(process.argv[3])),base=root+'/crawler/completeness/louis-vuitton',rows=[];if(cfg.country!=='US')throw Error('COUNTRY_SCOPE');
 for(const dir of ['published-alternates','us-listing-source'])if(spawnSync(root+'/scripts/crawl-output-guard.sh',[base+'/'+dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
 const target=JSON.parse(await fs.readFile(base+'/published-alternates/links.json')).find(r=>r.country==='US'),listing=JSON.parse(await fs.readFile(base+'/us-listing-source/links.json'))[0];if(!target||!listing)throw Error('PUBLISHED_SOURCE_MISSING');
 const browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL),context=browser.contexts()[0],page=context.pages()[0]??await context.newPage();let current=target.url;
 const row=status=>({brand:'louis-vuitton',country:'US',parentModel:'동일 브라우저 공식 국가 상세 보완',variantCode:louisVuittonCode(current)??'SOURCE',price:null,currency:'USD',status,officialUrl:current});
 const done=new Set(),runBase=root+'/crawler/runs/louis-vuitton/us';for(const id of await fs.readdir(runBase)){const file=runBase+'/'+id+'/summary.json';try{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(await fs.readFile(file)))if(r.status==='NORMAL_COUNTRY_DOCUMENT_SAVED'&&r.variantCode!=='SOURCE')done.add(r.variantCode);}catch{}}
 const all=JSON.parse(await fs.readFile(base+'/published-alternates/links.json')).filter(r=>r.country==='US'),pending=all.filter(r=>!done.has(r.code)).slice(0,cfg.maxProductsPerRun);
 try{let count=0;for(const {url,code} of pending){current=url;const u=new URL(url);if(u.origin!=='https://us.louisvuitton.com'||!u.pathname.startsWith(cfg.localePrefix)||louisVuittonCode(url)!==code)throw Error('COUNTRY_SCOPE');if(count)await new Promise(r=>setTimeout(r,2000));const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:cfg.navigationTimeoutMs});if(!response)throw Error('SOURCE_RESPONSE_MISSING');if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error('SOURCE_HTTP_FAILED');if(louisVuittonCode(page.url())!==code)throw Error('RENDERED_SKU_URL_MISMATCH');await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});const html=await page.content();if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(html,response.status());await fs.writeFile(run+'/raw/'+(++count)+'.source',html,{mode:0o600});rows.push(row('NORMAL_COUNTRY_DOCUMENT_SAVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}rows.push(row('PENDING_ATTRIBUTES_'+(all.length-done.size-pending.length)));}
 catch(error){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'COUNTRY_RENDER_FAILED'));process.exitCode=1;}
 finally{rows.push(row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}process.exit(process.exitCode??0);
}
