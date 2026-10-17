import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {louisVuittonAccess,louisVuittonCode} from './louis-vuitton-product.js';
import {nextLouisVuittonRenderCategory} from './louis-vuitton-http-plan.js';
import {louisVuittonRuntimeData} from './louis-vuitton-runtime-data.js';
// These account-side services are not catalogue inputs. Refuse them locally;
// their previously observed 403 is not a product-search refusal.
export function louisVuittonAncillaryApi(value){
 try{const u=new URL(value);return !u.username&&!u.password&&u.origin==='https://api.louisvuitton.com'&&/^\/eco-as\/(?:shopping-cart-eapi\/v1\/carts\/kor-kr|lvcom-wishlist-eapi\/v1\/kor-kr\/wishlists)\/?$/.test(u.pathname);}catch{return false;}
}
// Read the current retained page only: no navigation, fetch, clicks, cookies,
// profile creation, challenge interaction or replay of a denied URL.
export async function captureLouisVuittonCurrentData(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CRAWL_CDP_URL??''))throw Error('ISOLATED_PIPELINE_REQUIRED');
 const cfg=JSON.parse(await fs.readFile(process.argv[3])),run=process.env.CRAWL_RUN_DIR,rows=[];let url=cfg.entryUrl;
 const row=status=>({brand:'louis-vuitton',country:'KR',parentModel:'기존 정상 페이지 공개상품 상태',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:url});
 try{
  const browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL),page=browser.contexts()[0]?.pages()[0];if(!page)throw Error('EXISTING_PAGE_REQUIRED');
  const current=new URL(page.url());if(cfg.country!=='KR'||current.origin!=='https://kr.louisvuitton.com'||!current.pathname.startsWith(cfg.localePrefix))throw Error('CURRENT_PAGE_COUNTRY_SCOPE');url=current.href;
  const html=await page.content();if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(html);
  const visible=await page.locator('.lv-product-list .lv-product-card').count(),searchCode=current.searchParams.get('search');
  let exactSearch=false;
  if(searchCode&&/^(?:[A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})$/.test(searchCode)){
   const root=path.resolve(import.meta.dirname,'../..'),file=root+'/crawler/completeness/louis-vuitton/expanded-catalog-source/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
   exactSearch=JSON.parse(await fs.readFile(path.dirname(file)+'/candidates.json')).some(r=>r.code===searchCode);
  }
  if(!visible&&!louisVuittonCode(url)&&!exactSearch)throw Error('CURRENT_PUBLIC_PRODUCT_REQUIRED');
  // Bounded structural evidence distinguishes an open search control from a
  // hydrated result page without exposing page text, account data or payloads.
  const structure=await page.evaluate(()=>({
   SEARCH_INPUTS:document.querySelectorAll('input[type="search"]').length,
   SEARCH_FORMS:document.querySelectorAll('form[role="search"]').length,
   SEARCH_RESULT_NODES:document.querySelectorAll('[class*="search-result"]').length,
   SEARCH_OVERLAYS:document.querySelectorAll('[class*="search-overlay"], [class*="search-modal"]').length,
   APP_SCRIPT_TAGS:document.scripts.length,
   LOADED_SCRIPT_RESOURCES:performance.getEntriesByType('resource').filter(e=>e.initiatorType==='script').length,
   NUXT_STATE_PRESENT:Number(Boolean(window.__NUXT__?.state)),
   NUXT_APP_PRESENT:Number(Boolean(window.$nuxt)),
  }));
  for(const [key,value] of Object.entries(structure))rows.push(row(key+'_'+Math.min(value,9999)));
  const resourceHosts=await page.evaluate(()=>{
   const hosts=new Map();
   for(const e of performance.getEntriesByType('resource'))if(['script','fetch','xmlhttprequest'].includes(e.initiatorType)){
    try{const u=new URL(e.name);if(u.protocol!=='https:'||u.username||u.password)continue;const key=u.hostname;const v=hosts.get(key)??{host:key,total:0,failed:0};v.total++;if(e.responseStatus>=400||e.responseStatus===0&&e.transferSize===0&&e.decodedBodySize===0)v.failed++;hosts.set(key,v);}catch{}
   }
   return [...hosts.values()].slice(0,30);
  });
  for(const r of resourceHosts)if(/^[a-z0-9.-]{1,120}$/.test(r.host))rows.push({...row('RESOURCE_TOTAL_'+r.total+'_FAILED_'+r.failed),parentModel:r.host,variantCode:'RESOURCE_HOST'});
  const apiKinds=await page.evaluate(()=>{
   const groups={};for(const e of performance.getEntriesByType('resource'))try{
    const u=new URL(e.name);if(u.hostname!=='api.louisvuitton.com'||!['fetch','xmlhttprequest'].includes(e.initiatorType))continue;
    const kind=/search|catalog|product/i.test(u.pathname)?'CATALOG':'OTHER',status=Number.isInteger(e.responseStatus)?e.responseStatus:0,key=kind+'_API_STATUS_'+status;
    groups[key]=(groups[key]??0)+1;
   }catch{}return groups;
  });
  // Resource Timing status 0 is unavailable, never evidence of HTTP refusal.
  for(const [key,n] of Object.entries(apiKinds))rows.push(row(key+'_COUNT_'+n));
  const publicApiPaths=await page.evaluate(()=>{
   const paths=new Map();for(const e of performance.getEntriesByType('resource'))try{
    const u=new URL(e.name);if(u.hostname!=='api.louisvuitton.com'||!['fetch','xmlhttprequest'].includes(e.initiatorType)||u.username||u.password||u.pathname.length>350||/auth|token|cookie|account|session|customer|checkout|password/i.test(u.pathname))continue;
    paths.set(u.pathname+'|'+e.responseStatus,{url:u.origin+u.pathname,status:Number.isInteger(e.responseStatus)?e.responseStatus:0});
   }catch{}return [...paths.values()].slice(-10);
  });
  for(const p of publicApiPaths)rows.push({...row('OBSERVED_API_RESOURCE_HTTP_'+p.status),officialUrl:p.url});
  const refusals=publicApiPaths.filter(p=>[401,403,429].includes(p.status));
  if(refusals.length&&refusals.every(p=>louisVuittonAncillaryApi(p.url))&&!Object.keys(apiKinds).some(k=>k.endsWith('_STATUS_0')))rows.push(row('ANCILLARY_API_REFUSAL_ONLY'));
  if(publicApiPaths.some(p=>p.status===200&&p.url==='https://api.louisvuitton.com/eco-eu/search-merch-eapi/v1/kor-kr/records/autocomplete')&&refusals.every(p=>louisVuittonAncillaryApi(p.url)||p.url==='https://api.louisvuitton.com/eco-eu/search-merch-eapi/v1/kor-kr/records')&&!Object.keys(apiKinds).some(k=>k.endsWith('_STATUS_0')))rows.push(row('AUTOCOMPLETE_NORMAL_SOURCE'));
  const data=await page.evaluate(louisVuittonRuntimeData),records=exactSearch?data.filter(r=>r.sku===searchCode):data,json=JSON.stringify(records).replaceAll('<','\\u003c');if(Buffer.byteLength(json)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
  // Normal search HTML can contain priced cards even when no public store
  // branch exists. Keep that official document for the existing exact-SKU
  // card parser; an empty projected store is not an empty search result.
  await fs.writeFile(run+'/raw/1.source',html,{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'),row('PUBLIC_RUNTIME_RECORDS_'+records.length));
  if(records.length){await fs.writeFile(run+'/raw/2.source','<script type="application/json">'+json+'</script>',{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'));}
 }catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'CURRENT_PUBLIC_SOURCE_FAILED'));process.exitCode=1;}
 finally{rows.push(row('NO_NAVIGATION_OR_REQUEST'),row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
 process.exit(process.exitCode??0);
}
export async function searchLouisVuittonPriceSample(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CRAWL_CDP_URL??''))throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),cfg=JSON.parse(await fs.readFile(process.argv[3])),run=process.env.CRAWL_RUN_DIR,base=root+'/crawler/completeness/louis-vuitton',rows=[];let url=cfg.entryUrl,code='SOURCE';
 const row=status=>({brand:'louis-vuitton',country:'KR',parentModel:'공식 검색창 동일 제품번호 표본',variantCode:code,price:null,currency:'KRW',status,officialUrl:url});
 try{
  for(const folder of ['expanded-catalog-source','field-source'])if(spawnSync(root+'/scripts/crawl-output-guard.sh',[base+'/'+folder+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
  const priced=new Set(JSON.parse(await fs.readFile(base+'/field-source/fields.json')).filter(r=>r.currency==='KRW'&&r.price>0).map(r=>r.code)),targets=JSON.parse(await fs.readFile(base+'/expanded-catalog-source/candidates.json'));
  // First establish a positive control using an already verified priced SKU.
  // A single missing unpriced item cannot validate the search interaction.
  const accessVersion=cfg.allowedHosts.includes('api.louisvuitton.com')?'-api-host-v1':'';
  let controlMarker=root+'/crawler/runtime/louis-vuitton-browser/search-control'+accessVersion+'.json';
  let control=false;try{await fs.access(controlMarker);}catch(e){if(e.code!=='ENOENT')throw e;control=true;}
  if(!control){
   let previous=JSON.parse(await fs.readFile(controlMarker)),proof=previous.run+'/summary.json';
   if(!path.resolve(previous.run).startsWith(root+'/crawler/runs/louis-vuitton/kr/')||spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status)throw Error('SEARCH_CONTROL_NOT_VERIFIED');
   let evidence=JSON.parse(await fs.readFile(proof));
   if(!evidence.some(r=>r.variantCode===previous.code&&r.status==='SEARCH_EXACT_SKU_FOUND')){
    // Enabling a new host does not cause Vue to refetch an unchanged query.
    // Preserve that no-op attempt; test one distinct, never searched control.
    if(!accessVersion)throw Error('SEARCH_CONTROL_NOT_VERIFIED');
    controlMarker=root+'/crawler/runtime/louis-vuitton-browser/search-control'+accessVersion+'-distinct-query.json';
    try{
     previous=JSON.parse(await fs.readFile(controlMarker));proof=previous.run+'/summary.json';
     if(!path.resolve(previous.run).startsWith(root+'/crawler/runs/louis-vuitton/kr/')||spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status)throw Error('SEARCH_CONTROL_NOT_VERIFIED');
     evidence=JSON.parse(await fs.readFile(proof));
     if(!evidence.some(r=>r.variantCode===previous.code&&r.status==='SEARCH_EXACT_SKU_FOUND'))throw Error('SEARCH_CONTROL_NOT_VERIFIED');
    }catch(e){if(e.code!=='ENOENT')throw e;control=true;}
   }
  }
  let target;
  for(const candidate of targets){
   if(priced.has(candidate.code)!==control)continue;
   let attempted=false;
   for(const suffix of control?['',accessVersion]:[accessVersion,'-autocomplete-v1'])try{await fs.access(root+'/crawler/runtime/louis-vuitton-browser/search-ui-'+candidate.code+suffix+'.json');attempted=true;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(attempted)continue;
   target=candidate;break;
  }
  if(!target||louisVuittonCode(target.url)!==target.code)throw Error('SEARCH_TARGET_UNAVAILABLE');code=target.code;
  if(control){const h=await fs.open(controlMarker,'wx',0o600);await h.writeFile(JSON.stringify({run,code}));await h.close();rows.push(row('SEARCH_POSITIVE_CONTROL'));}
  const marker=root+'/crawler/runtime/louis-vuitton-browser/search-ui-'+code+(control?accessVersion:'-autocomplete-v1')+'.json';const h=await fs.open(marker,'wx',0o600);await h.writeFile(JSON.stringify({run,code}));await h.close();
  const browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL),page=browser.contexts()[0]?.pages()[0];if(!page)throw Error('EXISTING_PAGE_REQUIRED');
  const current=new URL(page.url());if(cfg.country!=='KR'||current.origin!=='https://kr.louisvuitton.com'||!current.pathname.startsWith(cfg.localePrefix))throw Error('CURRENT_PAGE_COUNTRY_SCOPE');url=current.href;louisVuittonAccess(await page.content());
  const apiResponses=[],publicResponses=[],apiRefusals=[];let responseLimit=false;
  await page.route(/^https:\/\/api\.louisvuitton\.com\/eco-as\/(?:shopping-cart-eapi\/v1\/carts\/kor-kr|lvcom-wishlist-eapi\/v1\/kor-kr\/wishlists)(?:[/?]|$)/,route=>route.abort());
  // The full-result endpoint was actually refused. Never submit/replay it;
  // use only the independently observed normal autocomplete UI response.
  await page.route(/^https:\/\/api\.louisvuitton\.com\/eco-eu\/search-merch-eapi\/v1\/kor-kr\/records(?:\?|$)/,route=>route.abort());
  page.on('response',r=>{try{
   const u=new URL(r.url());if(u.hostname!=='api.louisvuitton.com'||louisVuittonAncillaryApi(u.href))return;apiResponses.push(r.status());
   if([401,403,429].includes(r.status())&&u.pathname.length<350&&!/auth|cookie|account|session|customer|password/i.test(u.pathname))apiRefusals.push({url:u.origin+u.pathname,status:r.status()});
   if(r.ok()&&r.request().method()==='GET'&&/search|catalog|product/i.test(u.pathname)&&!/auth|token|account|customer|session|checkout/i.test(u.pathname)&&/json/i.test(r.headers()['content-type']??''))publicResponses.push(r.body().then(b=>{
    if(b.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
    const data=JSON.parse(b.toString('utf8'));return {records:louisVuittonRuntimeData({__NUXT__:{state:{products:data}}}).filter(v=>v.sku===code),document:u.pathname==='/eco-eu/search-merch-eapi/v1/kor-kr/records/autocomplete'?JSON.stringify(data):null};
   }).catch(e=>{if(e.message==='RESPONSE_LIMIT')responseLimit=true;return {records:[],document:null};}));
  }catch{}});
  let input=page.locator('input[type="search"]:visible');
  if(await input.count()!==1){const open=page.getByRole('button',{name:/^(?:검색|검색 열기|Search|Open search)$/i});if(await open.count()!==1)throw Error('SEARCH_CONTROL_UNAVAILABLE');await open.click({timeout:5000});input=page.locator('input[type="search"]:visible');}
  if(await input.count()!==1)throw Error('SEARCH_INPUT_UNAVAILABLE');
  await input.fill(code);rows.push(row('AUTOCOMPLETE_ONLY_NO_SUBMIT'));
  // Match the pathname identity, not the whole href: tracking query strings
  // and the official legacy -SKU.html paths must not hide real results.
  await page.waitForFunction(c=>[...document.querySelectorAll('a[href]')].some(a=>{try{return new URL(a.href).pathname.match(/(?:-|\/)([A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})(?:\.(?:html|htm))?\/?$/i)?.[1]?.toUpperCase()===c;}catch{return false;}}),code,{timeout:15000}).catch(()=>{});
  const final=new URL(page.url());if(final.origin!==current.origin||!final.pathname.startsWith(cfg.localePrefix))throw Error('SEARCH_COUNTRY_SCOPE');url=final.href;
  const html=await page.content();if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(html);
  rows.push(row('SEARCH_API_RESPONSES_'+apiResponses.length));
  for(const s of [...new Set(apiResponses)])rows.push(row('SEARCH_API_HTTP_'+s));
  for(const refused of apiRefusals.slice(0,10))rows.push({...row('REFUSED_API_HTTP_'+refused.status),officialUrl:refused.url});
  if(apiResponses.some(s=>[401,403,429].includes(s)))throw Error('ACCESS_BLOCKED');
  await fs.writeFile(run+'/raw/1.source',html,{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'));
  const responses=await Promise.all(publicResponses);if(responseLimit)throw Error('RESPONSE_LIMIT');let sourceNumber=1;
  // This is an observed public product-suggestion GET, not a token/account
  // endpoint. Preserve its normal body locally for deterministic SKU-bound
  // parsing even if a UI anchor has not rendered. Never expose it to a model.
  for(const response of responses)if(response.document){await fs.writeFile(run+'/raw/'+(++sourceNumber)+'.source','<script type="application/json">'+response.document.replaceAll('<','\\u003c')+'</script>',{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'),row('NORMAL_AUTOCOMPLETE_BODY_SAVED'));}
  const links=await page.locator('a[href]').evaluateAll(as=>as.map(a=>a.href));
  const captured=responses.flatMap(r=>r.records);
  if(!captured.length&&!links.some(href=>{try{const u=new URL(href);return u.origin===current.origin&&u.pathname.startsWith(cfg.localePrefix)&&louisVuittonCode(href)===code;}catch{return false;}}))throw Error('SEARCH_EXACT_SKU_UNAVAILABLE');
  rows.push(row('SEARCH_EXACT_SKU_FOUND'));
  const runtime=await page.evaluate(louisVuittonRuntimeData),records=[...captured,...runtime.filter(v=>v.sku===code)],json=JSON.stringify(records).replaceAll('<','\\u003c');
  if(responseLimit)throw Error('RESPONSE_LIMIT');
  rows.push(row('PUBLIC_SEARCH_RECORDS_'+captured.length));
  if(Buffer.byteLength(json)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');if(records.length){await fs.writeFile(run+'/raw/'+(++sourceNumber)+'.source','<script type="application/json">'+json+'</script>',{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'),row('PUBLIC_RUNTIME_RECORDS_'+records.length));}
 }catch(e){rows.push(row(e.code==='EEXIST'?'SEARCH_SAMPLE_ALREADY_ATTEMPTED':/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SEARCH_SAMPLE_FAILED'));process.exitCode=1;}
 finally{rows.push(row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
 process.exit(process.exitCode??0);
}
export async function renderLouisVuittonPublishedSource(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR,cfg=JSON.parse(await fs.readFile(process.argv[3])),listing=process.argv[4]==='--render-published-list',proof=listing?root+'/crawler/completeness/louis-vuitton/published-alternates/summary.json':root+'/crawler/completeness/louis-vuitton/untried-http-detail/summary.json';
 if(cfg.country!=='KR'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CRAWL_CDP_URL??'')||spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status)throw Error('NORMAL_PUBLIC_SOURCE_REQUIRED');
 const proofs=JSON.parse(await fs.readFile(proof));
 const attempts=root+'/crawler/runtime/louis-vuitton-browser';
 const markerFor=url=>attempts+'/published-list-'+createHash('sha256').update(url).digest('hex')+'.json';
 let evidence;
 if(listing){
  const runs=[],marked=new Set(),base=root+'/crawler/runs/louis-vuitton/kr';
  for(const id of await fs.readdir(base)){const file=base+'/'+id+'/summary.json';try{await fs.access(file);}catch{continue;}if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');runs.push({rows:JSON.parse(await fs.readFile(file))});}
  for(const r of proofs)try{await fs.access(markerFor(r.officialUrl));marked.add(r.officialUrl);}catch(e){if(e.code!=='ENOENT')throw e;}
  evidence=nextLouisVuittonRenderCategory(proofs,runs,url=>marked.has(url));
 }
 else {
  const candidate=proofs.find(r=>r.status==='UNTRIED_OFFICIAL_HTTP_DETAIL');
  if(candidate){
   let normal=false,visited=false;const base=root+'/crawler/runs/louis-vuitton/kr';
   for(const id of await fs.readdir(base)){const f=base+'/'+id+'/summary.json';try{await fs.access(f);}catch{continue;}
    if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
    for(const r of JSON.parse(await fs.readFile(f)))if(r.officialUrl===candidate.officialUrl){
     if(r.status==='NORMAL_HTTP_DOCUMENT_SAVED')normal=true;
     if(/NORMAL_RENDERED_DOCUMENT_SAVED|ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION|SOURCE_HTTP_FAILED|PUBLISHED_SOURCE_FAILED/.test(r.status))visited=true;
    }
   }
   if(normal&&!visited)evidence=candidate;
  }
 }
 if(!evidence||new URL(evidence.officialUrl).origin!=='https://kr.louisvuitton.com'||(listing?!/^\/kor-kr\/(?:women\/handbags|men\/bags)\//.test(new URL(evidence.officialUrl).pathname):louisVuittonCode(evidence.officialUrl)!==evidence.variantCode))throw Error('REFERENCE_IDENTITY');
 const marker=listing?markerFor(evidence.officialUrl):attempts+'/published-detail-'+createHash('sha256').update(evidence.officialUrl).digest('hex')+'.json';
 const row=status=>({brand:'louis-vuitton',country:'KR',parentModel:'새 정상 공식 주소의 기존 브라우저 확인',variantCode:evidence.variantCode,price:null,currency:'KRW',status,officialUrl:evidence.officialUrl}),rows=[];
 try{
  const handle=await fs.open(marker,'wx',0o600);await handle.writeFile(JSON.stringify({source:proof,run}));await handle.close();
  const browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL),context=browser.contexts()[0],page=context?.pages()[0];if(!page)throw Error('EXISTING_PAGE_REQUIRED');
  const response=await page.goto(evidence.officialUrl,{waitUntil:'domcontentloaded',timeout:cfg.navigationTimeoutMs});if(!response)throw Error('SOURCE_RESPONSE_MISSING');if([401,403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error('SOURCE_HTTP_FAILED');
  await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});const html=await page.content();if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(html,response.status());if(new URL(page.url()).origin!=='https://kr.louisvuitton.com'||(listing?page.url()!==evidence.officialUrl:louisVuittonCode(page.url())!==evidence.variantCode))throw Error('RENDERED_SKU_URL_MISMATCH');
  await fs.writeFile(run+'/raw/1.source',html,{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'));
  // Hydrated catalogue state is not necessarily serialized back into HTML.
  // Project only SKU-owned public product fields after normal-page checks.
  const runtime=await page.evaluate(louisVuittonRuntimeData),serialized=JSON.stringify(runtime).replaceAll('<','\\u003c');
  if(Buffer.byteLength(serialized)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');
  if(runtime.length){await fs.writeFile(run+'/raw/2.source','<script type="application/json">'+serialized+'</script>',{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'),row('PUBLIC_RUNTIME_RECORDS_'+runtime.length));}
 }catch(error){rows.push(row(error.code==='EEXIST'?'PUBLISHED_SOURCE_ALREADY_ATTEMPTED':/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'PUBLISHED_SOURCE_FAILED'));process.exitCode=1;}
 finally{rows.push(row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
 process.exit(process.exitCode??0);
}
