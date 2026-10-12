import fs from 'node:fs';
import {catalogTargetBatches} from '../crawler/common/catalog-target-batches.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {coverageFailure} from '../crawler/common/prada-market-store.js';
import {reportCrawlFailure} from './crawler-alert.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const country=process.argv[2]??'kr';
if(!/^[a-z]{2}$/.test(country))throw new Error('invalid country');
const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/prada/countries',country)));
const state=path.join(root,'crawler','prada-progress',country);
fs.mkdirSync(state,{recursive:true});
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!key)throw new Error('server credential required');
async function query(endpoint,method='GET',body){
 return guardedRest(endpoint,method,body,key);
}
async function references(){
 const rows=[];for(let offset=0;;offset+=500){const batch=await query(`rpc/crawler_korean_references?limit=500&offset=${offset}`,'POST',{p_brand:'prada'});rows.push(...batch);if(batch.length<500)break;}
 return rows;
}
function latestRun(){return fs.readdirSync(path.join(root,'crawler/runs/prada',country)).sort().at(-1);}
function pipeline(args){
 const result=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['prada',country,...args],{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],maxBuffer:32768,timeout:10*60*1000});
 if(result.status!==0){process.exitCode=result.status===78?78:1;throw Object.assign(new Error('guarded pipeline failed'),{failureCode:/FAILED: ([A-Z0-9_]+)/.exec(result.stderr?.toString()??'')?.[1]??'PIPELINE_FAILED'});}
 return path.join(root,'crawler/runs/prada',country,latestRun());
}
function writeSummary(rows,phase){
 const summary=rows.map(row=>({brand:'prada',country:config.country,parentModel:'한국 기준',variantCode:row.normalized_code,price:null,currency:config.currency,status:phase,officialUrl:row.official_url?.length<=500?row.official_url:config.listingUrls[0]}));
 if(!summary.length)summary.push({brand:'prada',country:config.country,parentModel:'한국 기준',variantCode:'RUN',price:null,currency:config.currency,status:phase,officialUrl:config.listingUrls[0]});
 for(let i=0;i<summary.length;i+=25){const file=path.join(state,i===0?'summary.json':`summary-${i/25}.json`);fs.writeFileSync(file,JSON.stringify(summary.slice(i,i+25)));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('progress summary blocked');}
}
async function verify(){
 let rows=await references();const markets=[];
 const scopeIndex=process.argv.indexOf('--reference-codes-file');
 if(scopeIndex>=0){const selected=JSON.parse(fs.readFileSync(process.argv[scopeIndex+1]));if(!Array.isArray(selected)||!selected.length||selected.length>500||selected.some(code=>typeof code!=='string'||!/^[A-Z0-9]+$/.test(code)))throw new Error('invalid verification scope');const codes=new Set(selected);rows=rows.filter(row=>codes.has(row.normalized_code));if(rows.length!==codes.size)throw new Error('verification reference missing');}
 for(let offset=0;;offset+=500){const batch=await query(`market_products?country_code=eq.${config.country}&select=variant_id,official_product_code,current_price,currency_code,official_url&order=id&limit=500&offset=${offset}`);markets.push(...batch);if(batch.length<500)break;}
 const summaries=rows.map(row=>{const market=markets.find(item=>item.variant_id===row.id);const valid=market&&market.official_product_code===row.normalized_code&&market.currency_code===config.currency&&market.official_url.startsWith(`https://www.prada.com${config.referenceDetailPrefix}`)&&decodeURIComponent(new URL(market.official_url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()===row.normalized_code;return {brand:'prada',country:config.country,parentModel:'한국 기준',variantCode:row.normalized_code,price:valid?Number(market.current_price)||null:null,currency:config.currency,status:valid?(market.current_price==null?'price_unavailable':'confirmed'):'unprocessed',officialUrl:market?.official_url?.length<=500?market.official_url:config.listingUrls[0]};});
 let discoveryMissing=0;
 if(country==='kr'&&scopeIndex<0){
  const runs=path.join(root,'crawler/runs/prada/kr');const discovery=fs.readdirSync(runs).sort().reverse().find(name=>fs.existsSync(path.join(runs,name,'artifacts/discovered-urls.json')));
  if(!discovery)throw new Error('discovery baseline missing');const urls=JSON.parse(fs.readFileSync(path.join(runs,discovery,'artifacts/discovered-urls.json')));const codes=new Set(rows.map(row=>row.normalized_code));discoveryMissing=urls.filter(url=>!codes.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase())).length;
 }
 for(let i=0;i<summaries.length;i+=25){const file=path.join(state,i===0?'summary.json':`summary-${i/25}.json`);fs.writeFileSync(file,JSON.stringify(summaries.slice(i,i+25)));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('verification summary blocked');}
 const report=[['REFERENCE',rows.length],['LINKED',summaries.filter(r=>r.status!=='unprocessed').length],['CONFIRMED',summaries.filter(r=>r.status==='confirmed').length],['UNAVAILABLE',summaries.filter(r=>r.status==='price_unavailable').length],['UNPROCESSED',summaries.filter(r=>r.status==='unprocessed').length],['DISCOVERY_MISSING',discoveryMissing]].map(([label,count])=>({brand:'prada',country:config.country,parentModel:'검증 합계',variantCode:'TOTAL',price:null,currency:config.currency,status:`${label}_${count}`,officialUrl:config.listingUrls[0]}));
 const folder=path.join(state,'report');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify(report));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('report blocked');
 const failure=coverageFailure(summaries,discoveryMissing);if(failure)throw Object.assign(new Error('incomplete country coverage'),{failureCode:failure});
 const unresolved=summaries.filter(row=>row.status==='price_unavailable').length;
 if(unresolved){const alert={brand:'prada',country:config.country,parentModel:'한국 기준 해외 가격',variantCode:'TOTAL',price:null,currency:config.currency,status:`UNRESOLVED_PRICES_${unresolved}`,officialUrl:config.listingUrls[0]};const result=await reportCrawlFailure(alert,{queuePath:path.join(state,'alert-queue.json'),fetcher:async(url,options)=>{if(url!=='https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/operations_alerts?on_conflict=dedupe_key')throw new Error('unapproved alert destination');const entries=JSON.parse(options.body);for(const entry of entries){const existing=await query(`operations_alerts?dedupe_key=eq.${encodeURIComponent(entry.dedupe_key)}&select=dedupe_key&limit=1`);if(!existing.length)await query('operations_alerts','POST',[entry]);}return {ok:true};}});if(!result.stored)throw Object.assign(new Error('unresolved alert not delivered'),{failureCode:'ALERT_TRANSPORT_FAILED'});}
}
try{
 if(process.argv.includes('--audit-reference')||process.argv.includes('--repair-verified')){
  if(country!=='kr')throw new Error('Korean reference audit required');
  const result=spawnSync(process.execPath,[path.join(root,'scripts/audit-prada-catalog.mjs'),...(process.argv.includes('--repair-verified')?['--verified-repair']:[])],{cwd:root,env:process.env,stdio:'ignore',timeout:2*60*60000});
  if(result.status!==0){process.exitCode=result.status===78?78:1;throw Object.assign(new Error('independent reference audit incomplete'),{failureCode:'INDEPENDENT_AUDIT_INCOMPLETE'});}
 }else if(process.argv.includes('--verify-only')){
  await verify();
 }else if(process.argv.includes('--linked-reference')){
  if(country!=='kr')throw new Error('Korean linked reference only');
  const result=spawnSync(process.execPath,[path.join(root,'scripts/collect-prada-linked-bags.mjs'),'--approved-cached-candidates'],{cwd:root,env:process.env,stdio:'ignore',timeout:30*60000});
  if(result.status!==0)throw Object.assign(new Error('linked reference failed'),{failureCode:'LINKED_REFERENCE_FAILED'});
 }else if(process.argv.includes('--ingest-reference-urls')){
  if(country!=='kr')throw new Error('foreign reference ingestion forbidden');
  const file=process.argv[process.argv.indexOf('--ingest-reference-urls')+1];
  const urls=JSON.parse(fs.readFileSync(file));
  if(!Array.isArray(urls)||!urls.length||urls.length>25||urls.some(value=>{const url=new URL(value);return url.origin!=='https://www.prada.com'||!url.pathname.startsWith(config.referenceDetailPrefix)||!/^[A-Z0-9_]+$/.test(decodeURIComponent(url.pathname.split('/').at(-1)));}))throw new Error('invalid scoped Korean URLs');
  for(let i=0;i<urls.length;i+=8){const batch=path.join(state,'batch-urls.json');fs.writeFileSync(batch,JSON.stringify(urls.slice(i,i+8)));pipeline(['--urls-file',batch]);}
 }else if(process.argv.includes('--discover-reference')){
  if(country!=='kr')throw new Error('foreign discovery forbidden');
  const run=pipeline(['--crawl-only','--discover']);
  let urls=JSON.parse(fs.readFileSync(path.join(run,'artifacts/discovered-urls.json')));
  if(process.argv.includes('--remaining')){const existing=new Set((await references()).map(row=>row.normalized_code));urls=urls.filter(url=>!existing.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()));}
  for(let i=0;i<urls.length;i+=8){const file=path.join(state,'batch-urls.json');let batch=urls.slice(i,i+8);writeSummary([{normalized_code:'DISCOVERY',official_url:config.listingUrls[0]}],`INGESTING_${i}_OF_${urls.length}`);const extra=[];if(process.argv.includes('--remaining')){const existing=(await references()).map(row=>row.normalized_code),codes=new Set(existing);batch=batch.filter(url=>!codes.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()));if(!batch.length)continue;const excluded=path.join(state,'existing-codes.json');fs.writeFileSync(excluded,JSON.stringify(existing));extra.push('--exclude-codes-file',excluded);}fs.writeFileSync(file,JSON.stringify(batch));pipeline(['--urls-file',file,'--expand-variants',...extra]);}
  // The mandatory audit phase discovers independent families before traversing
  // old detail links; a failed linked inspection cannot masquerade as complete.
 }else{
  let rows=await references();if(!rows.length)throw new Error('Korean reference missing');
  const codesIndex=process.argv.indexOf('--reference-codes-file');
  if(codesIndex>=0){const codes=JSON.parse(fs.readFileSync(process.argv[codesIndex+1]));if(!Array.isArray(codes)||codes.length>500||codes.some(code=>typeof code!=='string'||!/^[A-Z0-9]+$/.test(code)))throw new Error('invalid targeted reference codes');const wanted=new Set(codes);const matched=rows.filter(row=>wanted.has(row.normalized_code));if(matched.length!==wanted.size)throw new Error('target reference missing');rows=matched;}
  const resolveOnly=process.argv.includes('--resolve-unavailable');if(resolveOnly&&country==='kr')throw new Error('foreign resolution only');
  if(process.argv.includes('--remaining')){const markets=[];for(let offset=0;;offset+=500){const page=await query(`market_products?country_code=eq.${config.country}&select=variant_id,official_product_code,current_price,currency_code,official_url&limit=500&offset=${offset}&order=id`);markets.push(...page);if(page.length<500)break;}rows=rows.filter(row=>!markets.some(m=>m.variant_id===row.id&&m.official_product_code===row.normalized_code&&m.currency_code===config.currency&&m.current_price!=null&&m.official_url.startsWith(`https://www.prada.com${config.referenceDetailPrefix}`)));}
  const limitIndex=process.argv.indexOf('--limit');let selected=limitIndex>=0?rows.slice(0,Number(process.argv[limitIndex+1])):rows;
  let index=new Map(),familyByStyle=new Map();if(country!=='kr'&&selected.length){writeSummary([{normalized_code:'INDEX',official_url:config.listingUrls[0]}],'BUILDING_PRICE_INDEX');const run=pipeline(['--crawl-only',process.argv.includes('--independent-index')?'--sitemap-price-index':'--build-price-index']);index=new Map(JSON.parse(fs.readFileSync(path.join(run,'artifacts/price-url-index.json'))));
   const cached=process.argv.includes('--cached-options');if(cached){const file=path.join(state,'cached-option-index.json');if(!fs.existsSync(file))throw new Error('cached option index missing');for(const[code,url]of JSON.parse(fs.readFileSync(file))){const target=new URL(url);if(target.origin!=='https://www.prada.com'||!target.pathname.startsWith(config.referenceDetailPrefix)||decodeURIComponent(target.pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()!==code)throw new Error('cached exact URL invalid');index.set(code,url);}}
   if(process.argv.includes('--native-first')){
    if(!process.argv.includes('--remaining'))throw Error('native-first requires remaining scope');
    const existingMarkets=[];for(let offset=0;;offset+=500){const page=await query(`market_products?country_code=eq.${config.country}&select=variant_id&limit=500&offset=${offset}&order=id`);existingMarkets.push(...page);if(page.length<500)break;}
    const existingIds=new Set(existingMarkets.map(row=>row.variant_id));
    const nativeRows=selected.filter(row=>index.has(row.normalized_code)||(!existingIds.has(row.id)&&[...index.keys()].some(code=>code.slice(0,6)===row.normalized_code.slice(0,6))));
    for(let i=0;i<nativeRows.length;i+=20){
     const batch=nativeRows.slice(i,i+20),file=path.join(state,'native-first-urls.json');
     fs.writeFileSync(file,JSON.stringify(batch.map(row=>{
      if(index.has(row.normalized_code))return index.get(row.normalized_code);
      const native=[...index].find(([code])=>code.slice(0,6)===row.normalized_code.slice(0,6));
      const url=new URL(native[1]),kr=new URL(row.official_url);
      if(kr.origin!=='https://www.prada.com'||!kr.pathname.startsWith('/kr/ko/p/'))throw Error('invalid Korean source');
      url.pathname=url.pathname.replace(/[^/]+$/,kr.pathname.split('/').at(-1));return url.href;
     })));
     writeSummary(batch,`NATIVE_PROCESSING_${i}_OF_${nativeRows.length}`);pipeline(['--urls-file',file]);
    }
    const confirmed=new Set();for(let offset=0;;offset+=500){const page=await query(`market_products?country_code=eq.${config.country}&current_price=not.is.null&select=variant_id,official_product_code,currency_code,official_url&limit=500&offset=${offset}&order=id`);for(const market of page)if(market.currency_code===config.currency&&market.official_url.startsWith(`https://www.prada.com${config.referenceDetailPrefix}`)&&selected.some(row=>row.id===market.variant_id&&row.normalized_code===market.official_product_code))confirmed.add(market.variant_id);if(page.length<500)break;}
    selected=selected.filter(row=>!confirmed.has(row.id));
   }
   const missing=selected.filter(row=>!index.has(row.normalized_code)),styles=new Set(missing.map(row=>row.normalized_code.slice(0,6)));
   if(missing.length){
    const profiles=[];for(let offset=0;;offset+=500){const page=await query(`product_variants?brands.slug=eq.prada&active=eq.true&select=normalized_code,style_code,brands!inner(slug),product_models(model_key)&order=normalized_code&limit=500&offset=${offset}`);profiles.push(...page);if(page.length<500)break;}
    const wanted=new Set(missing.map(row=>row.normalized_code)),families=new Set(profiles.filter(row=>wanted.has(row.normalized_code)&&row.product_models?.model_key&&!row.product_models.model_key.startsWith('unreviewed-')).map(row=>row.product_models.model_key));
    for(const profile of profiles){if(profile.product_models?.model_key&&!profile.product_models.model_key.startsWith('unreviewed-'))familyByStyle.set(profile.style_code,profile.product_models.model_key);if((process.argv.includes('--family-options')||(!process.argv.includes('--limit')&&codesIndex<0))&&families.has(profile.product_models?.model_key))styles.add(profile.style_code);}
   }
   const sources=missing.length&&!cached?[...new Set([...index].filter(([code])=>process.argv.includes('--deep-options')||styles.has(code.slice(0,6))).map(([,url])=>url))]:[];
   const targets=path.join(state,'option-targets.json');
   for(let i=0;i<sources.length;i+=20){
    writeSummary([{normalized_code:'OPTIONS',official_url:config.listingUrls[0]}],`CHECKING_OPTIONS_${i}_OF_${sources.length}`);
    const file=path.join(state,'option-sources.json');fs.writeFileSync(file,JSON.stringify(sources.slice(i,i+20)));
    // A growing Korean catalog must not exceed the reviewed 500-target bound.
    // Partition the work; never truncate it or weaken the crawler's guard.
    const unresolved=missing.filter(row=>!index.has(row.normalized_code));
    for(const codes of catalogTargetBatches(unresolved.map(row=>row.normalized_code))){
     fs.writeFileSync(targets,JSON.stringify(codes));
     const probe=pipeline(['--crawl-only','--probe-price-options','--urls-file',file,'--targets-file',targets]);
     for(const [code,url]of JSON.parse(fs.readFileSync(path.join(probe,'artifacts/price-option-index.json'))))if(!index.has(code))index.set(code,url);
    }
   }
   const resolution=selected.map(row=>({brand:'prada',country:config.country,parentModel:'미확인 공식 옵션 보완',variantCode:row.normalized_code,price:null,currency:config.currency,status:index.has(row.normalized_code)?'EXACT_OFFICIAL_PATH_FOUND':styles.has(row.normalized_code.slice(0,6))&&sources.some(url=>new URL(url).pathname.split('/').at(-1).startsWith(row.normalized_code.slice(0,6)))?'EXACT_OPTION_NOT_FOUND':'NO_MATCHING_STYLE_LISTED',officialUrl:index.get(row.normalized_code)??config.listingUrls[0]}));
   const folder=path.join(state,'resolution');fs.mkdirSync(folder,{recursive:true});for(let i=0;i<resolution.length;i+=25){const file=path.join(folder,i===0?'summary.json':`summary-${i/25}.json`);fs.writeFileSync(file,JSON.stringify(resolution.slice(i,i+25)));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw new Error('resolution summary blocked');}
   if(resolveOnly)selected=selected.filter(row=>index.has(row.normalized_code));
  }
  for(let i=0;i<selected.length;i+=20){
   const batch=selected.slice(i,i+20),file=path.join(state,'batch-urls.json');
   fs.writeFileSync(file,JSON.stringify(batch.map(row=>{
    const source=new URL(row.official_url);
    if(source.origin!=='https://www.prada.com'||!source.pathname.startsWith('/kr/ko/p/'))throw new Error('invalid Korean source');
    if(country==='kr')return source.href;
    if(index.has(row.normalized_code))return index.get(row.normalized_code);
    const family=familyByStyle.get(row.normalized_code.slice(0,6));
    const native=[...index].find(([code])=>code.slice(0,6)===row.normalized_code.slice(0,6))??(family?[...index].find(([code])=>familyByStyle.get(code.slice(0,6))===family):undefined);
    if(native){const target=new URL(native[1]);target.pathname=target.pathname.replace(/[^/]+$/,source.pathname.split('/').at(-1));return target.href;}
    // Do not transplant a Korean Unicode SEO slug into a foreign locale.
    // Prada routes by the exact SKU; the parser still requires that SKU and
    // the country's official currency before accepting any price.
    source.pathname=`${config.referenceDetailPrefix}prada/${source.pathname.split('/').at(-1)}`;
    return source.href;
   })));
   writeSummary(batch,`PROCESSING_${i}_OF_${selected.length}`);
   pipeline(['--urls-file',file,...(process.argv.includes('--prices-only')?['--prices-only']:[])]);
  }
 }
 await verify();
}catch(error){writeSummary([{normalized_code:'FAILED',official_url:config.listingUrls[0]}],error.failureCode??'FAILED');process.exitCode??=1;}
