import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {louisVuittonAccess,louisVuittonCode,louisVuittonJson,isLouisVuittonReference} from './louis-vuitton-product.js';
import {louisVuittonResolvedDetails} from './louis-vuitton-http-plan.js';
export const pendingLouisVuittonBrowserDetails=(targets,done,quarantined,priced,max)=>[...targets].filter(([code])=>!priced.has(code)&&!done.has(code)&&!quarantined.includes(code)).slice(0,max);
export async function renderLouisVuittonDetails(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR,cfg=JSON.parse(await fs.readFile(process.argv[3])),cdp=process.env.CRAWL_CDP_URL,rows=[];
 if(cfg.brand!=='louis-vuitton'||cfg.country!=='KR'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp??''))throw Error('SESSION_SCOPE');
 const folder=root+'/crawler/runtime/louis-vuitton-browser';await fs.mkdir(folder,{recursive:true});
 const sessionFile=folder+'/session.json';let previous;try{previous=JSON.parse(await fs.readFile(sessionFile));}catch(e){if(e.code!=='ENOENT')throw e;}
 const row=(status,url=cfg.entryUrl,code='SOURCE')=>({brand:cfg.brand,country:'KR',parentModel:'정상 실행 브라우저 상세 확인',variantCode:code,price:null,currency:'KRW',status,officialUrl:url});
 // A browser fetch can be refused while ordinary document navigation is
 // supported. Try that already-successful transport once in this same session,
 // not another fetch loop, new profile, cookie import or challenge solver.
 let navigationOnly=previous?.navigationOnly??false;
 let quarantined=previous?.quarantined??[],crossSkuAssessmentAttempted=previous?.crossSkuAssessmentAttempted??false;
 const browser=await chromium.connectOverCDP(cdp),context=browser.contexts()[0];if(!context)throw Error('SESSION_CONTEXT_MISSING');
 const page=context.pages()[0]??await context.newPage();
 if(previous?.halted){
  const priorRows=JSON.parse(await fs.readFile(previous.run+'/summary.json'));
  let normalFallback=previous.status==='ACCESS_BLOCKED'&&!previous.navigationOnly&&!previous.navigationFallbackAttempted&&priorRows.some(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED');
  const denied=priorRows.find(r=>r.status==='ACCESS_BLOCKED'&&r.variantCode!=='SOURCE'),document=await page.content(),title=await page.title(),verification=/captcha-delivery\.com\/captcha|cf-chl|px-captcha|verify you are human|추가 검증/i.test(document),explicitDenial=/access denied|forbidden/i.test(title);
  const currentCode=louisVuittonCode(page.url());
  const exactPublicProduct=louisVuittonJson(document).some(p=>[p['@type']].flat().includes('Product')&&p.sku===currentCode&&[p.offers].flat().some(o=>o?.priceCurrency==='KRW'&&Number(o.price)>0));
  if(!verification&&!explicitDenial&&isLouisVuittonReference(currentCode)&&exactPublicProduct){
   const priorTime=(await fs.stat(previous.run+'/summary.json')).mtimeMs,base=root+'/crawler/runs/louis-vuitton/kr';
   for(const id of await fs.readdir(base)){const file=base+'/'+id+'/summary.json';try{if((await fs.stat(file)).mtimeMs<=priorTime||spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;const proof=JSON.parse(await fs.readFile(file));if(proof.some(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED'&&r.variantCode===currentCode&&r.officialUrl===page.url())){normalFallback=true;rows.push(row('NEW_VERIFIED_PUBLIC_ACCESS',page.url(),currentCode));break;}}catch{}}
  }
  const crossSkuAssessment=previous.status==='ACCESS_BLOCKED'&&previous.navigationOnly&&!crossSkuAssessmentAttempted&&denied&&!verification&&!explicitDenial;
  if(crossSkuAssessment){quarantined=[...new Set([...quarantined,denied.variantCode])];crossSkuAssessmentAttempted=true;rows.push(row('UNVISITED_SKU_SCOPE_CHECK'));}
  else if(!normalFallback){const status=verification?'SECURITY_VERIFICATION_REQUIRED':explicitDenial?'OFFICIAL_ACCESS_DENIED_DOCUMENT':/not found|찾을 수 없|상품이 없습니다/i.test(title)?'OFFICIAL_ERROR_DOCUMENT':'DENIED_DOCUMENT_UNCLASSIFIED';rows.push(row(status,page.url(),louisVuittonCode(page.url())??'SOURCE'));rows.push(row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows));process.exit(1);}
  navigationOnly=true;rows.push(row('NORMAL_NAVIGATION_TRANSPORT'));
 }
 const state={cdp,run,halted:false,navigationOnly,quarantined,crossSkuAssessmentAttempted,navigationFallbackAttempted:navigationOnly||previous?.navigationFallbackAttempted||false,priorFailure:previous?.halted?{run:previous.run,status:previous.status}:previous?.priorFailure};await fs.writeFile(sessionFile,JSON.stringify(state),{mode:0o600});
 let count=0,current=cfg.entryUrl,active='SOURCE';
 try{
  const targets=new Map();for(const name of ['catalog-source','expanded-catalog-source']){const base=root+'/crawler/completeness/louis-vuitton/'+name;if(spawnSync(root+'/scripts/crawl-output-guard.sh',[base+'/summary.json'],{stdio:'ignore'}).status)throw Error('CATALOG_SOURCE_GUARD');for(const r of JSON.parse(await fs.readFile(base+'/candidates.json')))targets.set(r.code,r.url);}
  const done=new Set();const priorBase=root+'/crawler/runs/louis-vuitton/kr';for(const name of await fs.readdir(priorBase)){const file=priorBase+'/'+name+'/summary.json';try{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(await fs.readFile(file))){if(r.status==='NORMAL_RENDERED_DOCUMENT_SAVED'&&targets.get(r.variantCode)===r.officialUrl)done.add(r.variantCode);if(r.status==='ACCESS_BLOCKED'&&isLouisVuittonReference(r.variantCode))quarantined=[...new Set([...quarantined,r.variantCode])];}}catch{}}
  const fields=root+'/crawler/completeness/louis-vuitton/field-source';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[fields+'/summary.json'],{stdio:'ignore'}).status)throw Error('PRICE_SOURCE_GUARD');
  const held=JSON.parse(await fs.readFile(folder+'/workflow.json')).ingestHeld??{};
  const priced=louisVuittonResolvedDetails(JSON.parse(await fs.readFile(fields+'/fields.json')),held);
  const pending=pendingLouisVuittonBrowserDetails(targets,done,quarantined,priced,cfg.maxProductsPerRun);
  const urls=[...(!previous?[cfg.entryUrl]:[]),...pending.map(([,url])=>url)];
  for(const url of urls){
   if(count)await new Promise(resolve=>setTimeout(resolve,2000));
   const u=new URL(url);if(u.origin!==new URL(cfg.entryUrl).origin||!u.pathname.startsWith(cfg.localePrefix))throw Error('COUNTRY_SCOPE');current=url;active=louisVuittonCode(url)??'SOURCE';
   let html,status,actualUrl;
   if(previous&&!navigationOnly&&new URL(page.url()).origin===u.origin){
    const response=await page.evaluate(async({url,limit,timeout})=>{const r=await fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(timeout)});if(Number(r.headers.get('content-length'))>limit)return {status:r.status,url:r.url,tooLarge:true};const text=await r.text();return {status:r.status,url:r.url,text,tooLarge:text.length>limit};},{url,limit:cfg.maxResponseBytes,timeout:cfg.navigationTimeoutMs});
    if(response.tooLarge)throw Error('RESPONSE_LIMIT');html=response.text;status=response.status;actualUrl=response.url;
   }else{const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:cfg.navigationTimeoutMs});if(!response)throw Error('SOURCE_RESPONSE_MISSING');status=response.status();await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});html=await page.content();actualUrl=page.url();}
   if([401,403,429].includes(status))throw Error('ACCESS_BLOCKED');if(status<200||status>=300)throw Error('SOURCE_HTTP_FAILED');
   const actual=new URL(actualUrl);if(actual.origin!==u.origin||!actual.pathname.startsWith(cfg.localePrefix)||active!=='SOURCE'&&louisVuittonCode(actual.href)!==active)throw Error('RENDERED_SKU_URL_MISMATCH');
   if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(html,status);
   await fs.writeFile(run+'/raw/'+(++count)+'.source',html,{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED',url,active));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
  }
  rows.push(row('PENDING_DETAILS_'+(pendingLouisVuittonBrowserDetails(targets,done,quarantined,priced,cfg.maxCandidates).length-pending.length)));if(quarantined.length)rows.push(row('DENIED_DETAILS_PENDING_'+quarantined.length));
 }catch(e){const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'BROWSER_NAVIGATION_FAILED';rows.push(row(status,current,active));await fs.writeFile(sessionFile,JSON.stringify({...state,halted:true,status}),{mode:0o600});process.exitCode=1;}
 finally{rows.push(row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[run+'/summary.json'],{stdio:'ignore'}).status)process.exitCode=78;}
 process.exit(process.exitCode??0);
}
