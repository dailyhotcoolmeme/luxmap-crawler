import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {louisVuittonCode} from '../crawler/common/louis-vuitton-product.js';
import {louisVuittonForeignUrl} from '../crawler/common/louis-vuitton-foreign.js';
const root=path.resolve(import.meta.dirname,'..'),country=process.argv[2],countries=['kr','jp','fr','it','es','us','sg','hk'];
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER||!countries.includes(country))throw Error('COORDINATED_MARKET_REQUIRED');
const cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/'+country)),base=root+'/crawler/runs/louis-vuitton/'+country,out=root+'/crawler/louis-vuitton-progress/'+country;
const rendered=process.argv.includes('--browser');
const skuMode=process.argv.includes('--api-sku');
if(country==='kr'&&!skuMode)throw Error('KR_REGISTERED_PRICE_SCOPE');
const apiMode=process.argv.includes('--api')||skuMode;
let browserEnv={};
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(base,{recursive:true});
const guard=f=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(f));};
const rows=[],row=(status,url=cfg.entryUrl,code='TOTAL',price=null)=>({brand:'louis-vuitton',country:cfg.country,parentModel:'한국 기준 해외 가격 전체 대조',variantCode:code,price,currency:cfg.currency,status,officialUrl:url});
const save=()=>{fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});guard(out+'/summary.json');};
const pipeline=args=>{const before=new Set(fs.readdirSync(base)),p=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['louis-vuitton',country,...args],{cwd:root,env:{...process.env,...browserEnv},stdio:'ignore',timeout:1800000}),created=fs.readdirSync(base).filter(id=>!before.has(id));if(created.length!==1)throw Error('COUNTRY_RUN_MISSING');const dir=base+'/'+created[0],proof=guard(dir+'/summary.json');if(p.status===78)throw Error(proof.some(r=>r.status==='SECURITY_VERIFICATION_REQUIRED')?'SECURITY_VERIFICATION_REQUIRED':'COUNTRY_SAFETY_STOP');return {dir,proof,status:p.status??1};};
const applyBatchAttributes=result=>{
 if(country!=='kr'||!skuMode)return;
 const codes=[...new Set(result.proof.filter(r=>r.status==='EXACT_LOCAL_MODEL_PRICE').map(r=>r.variantCode))];if(!codes.length)return;
 const file=out+'/attribute-targets.json';fs.writeFileSync(file,JSON.stringify(codes),{mode:0o600});
 const execute=(script,args=[])=>spawnSync(process.execPath,[root+'/scripts/'+script,...args],{cwd:root,env:process.env,stdio:'ignore',timeout:600000}).status;
 if(execute('seed-louis-vuitton-registered.mjs')||execute('prepare-louis-vuitton-sources.mjs'))throw Error('BATCH_FIELD_PREPARATION_FAILED');
 if(execute('network-isolate.mjs',['["nxgnbrdxxmlhtcnymqsl.supabase.co"]','0',process.execPath,root+'/scripts/repair-louis-vuitton-metadata.mjs','--codes-file',file]))throw Error('BATCH_ATTRIBUTE_REPAIR_FAILED');
 const proof=guard(root+'/crawler/completeness/louis-vuitton/metadata-repair/summary.json');if(proof.some(r=>/FAILED|GUARD/.test(r.status)))throw Error('BATCH_ATTRIBUTE_PUBLIC_FAILED');
 rows.push(row('PRICE_ATTRIBUTE_PASS_PUBLIC_'+codes.length));save();
};
let references=[];
try{
 for(let offset=0;offset<10000;offset+=500){const page=guardedRest('rpc/crawler_korean_references?limit=500&offset='+offset,'POST',{p_brand:'louis-vuitton'});references.push(...page);if(page.length<500)break;if(offset===9500)throw Error('REFERENCE_LIMIT');}
 if(!references.length||new Set(references.map(r=>r.normalized_code)).size!==references.length)throw Error('KOREAN_REFERENCE_REQUIRED');
 rows.push(row('KOREAN_REFERENCE_'+references.length));
 const sample=process.argv.includes('--limit')&&process.argv[process.argv.indexOf('--limit')+1]==='1',controlReference=references.find(r=>r.normalized_code==='M29090');let controlPublic=false;
 if(sample&&controlReference){const markets=guardedRest('market_products?variant_id=eq.'+controlReference.id+'&country_code=eq.'+cfg.country+'&select=official_product_code,current_price,currency_code,official_url,price_status','GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);controlPublic=markets.length===1&&markets[0].official_product_code==='M29090'&&markets[0].currency_code===cfg.currency&&Number(markets[0].current_price)>0&&markets[0].price_status==='confirmed';if(controlPublic){louisVuittonForeignUrl(markets[0].official_url,cfg,'M29090');rows.push(row('CONTROL_ALREADY_PUBLIC_VERIFIED',markets[0].official_url,'M29090',Number(markets[0].current_price)));}}
 if(rendered&&!controlPublic){const p=spawnSync(process.execPath,[root+'/scripts/restore-louis-vuitton-relay.mjs',country],{cwd:root,env:process.env,stdio:'ignore'});if(p.status)throw Error('MAINTAINED_RELAY_REQUIRED');const meta=JSON.parse(fs.readFileSync(root+'/crawler/runtime/louis-vuitton-browser/session.json'));browserEnv={LUXURY_REUSE_CDP_URL:meta.cdp,LUXURY_BROWSER_SESSION_ID:'louis-vuitton-maintained',LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_BROWSER_REJECT_UNLISTED:'1'};}
 const prior=fs.readdirSync(base).sort().map(id=>({dir:base+'/'+id,file:base+'/'+id+'/summary.json'})).filter(r=>fs.existsSync(r.file)).map(r=>({...r,proof:guard(r.file)}));
 const transport=skuMode?'한국 동일 SKU 해외 SKU 연결':apiMode?'한국 동일 SKU 해외 공식 모델':rendered?'한국 동일 SKU 해외 유지 브라우저':'한국 동일 SKU 해외 공식 가격';
 const blocked=prior.some(r=>r.proof.some(p=>/ACCESS_BLOCKED|SECURITY_VERIFICATION/.test(p.status)&&p.parentModel===transport)||!rendered&&r.proof.some(p=>p.status==='ACCESS_BLOCKED')&&r.proof.some(p=>p.officialUrl===new URL('/robots.txt',cfg.entryUrl).href&&/^HTTP_(?:401|403|429)$/.test(p.status)));
 const restored=new Map(),stored=new Set(prior.flatMap(r=>r.proof.filter(p=>['EXACT_LOCAL_PRICE_CONFIRMED','SAVED_LOCAL_PRICE_CONFIRMED'].includes(p.status)).map(p=>p.variantCode)));
 for(const source of prior)for(const p of source.proof)if(['EXACT_SKU_URL','NORMAL_COUNTRY_DOCUMENT_SAVED'].includes(p.status)&&references.some(r=>r.normalized_code===p.variantCode)&&!stored.has(p.variantCode)){try{louisVuittonForeignUrl(p.officialUrl,cfg,p.variantCode);restored.set(p.variantCode,{code:p.variantCode,url:p.officialUrl,sourceRun:source.dir,savedFile:'1.source',sourceKind:'saved'});}catch{}}
 if(restored.size){fs.writeFileSync(out+'/targets.json',JSON.stringify([...restored.values()].slice(0,25)),{mode:0o600});const result=pipeline(['--foreign-prices','--targets-file',out+'/targets.json']);if(result.status===78)throw Error('COUNTRY_SAFETY_STOP');rows.push(row('SAVED_SOURCE_RESTORATION_'+restored.size));}
 if(!blocked&&apiMode){
  let targets=references.filter(r=>/-(?:nvprod\d+v|P\d+)\/[A-Z0-9]+$/i.test(r.official_url)).map(r=>({code:r.normalized_code,koreanUrl:r.official_url}));if(skuMode&&!process.argv.includes('--refresh')){const existing=guardedRest('market_products?country_code=eq.'+cfg.country+'&select=variant_id,official_product_code,current_price,currency_code,official_url,price_status','GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);const done=new Set(existing.filter(m=>m.currency_code===cfg.currency&&m.price_status==='confirmed'&&Number(m.current_price)>0&&references.some(r=>r.id===m.variant_id&&r.normalized_code===m.official_product_code)&&(()=>{try{louisVuittonForeignUrl(m.official_url,cfg,m.official_product_code);return true;}catch{return false;}})()).map(m=>m.official_product_code));targets=targets.filter(t=>!done.has(t.code));const alt=root+'/crawler/completeness/louis-vuitton/published-alternates';if(fs.existsSync(alt+'/summary.json')){guard(alt+'/summary.json');const published=new Set(JSON.parse(fs.readFileSync(alt+'/links.json')).filter(r=>r.country===cfg.country).map(r=>r.code));targets.sort((a,b)=>Number(published.has(b.code))-Number(published.has(a.code)));}}
  if(country==='kr'){
   const variants=guardedRest('product_variants?brands.slug=eq.louis-vuitton&active=eq.true&select=normalized_code,color_ko,material_ko,width_mm,height_mm,depth_mm,brands!inner(slug)&limit=10000','GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);
   const missing=new Set(variants.filter(p=>!p.color_ko||!p.material_ko||![p.width_mm,p.height_mm,p.depth_mm].every(v=>Number(v)>0)).map(p=>p.normalized_code));
   targets.sort((a,b)=>Number(missing.has(b.code))-Number(missing.has(a.code)));rows.push(row('ATTRIBUTE_INCOMPLETE_'+missing.size));
  }
  const control=targets.find(t=>t.code==='M29090');if(control)targets=[control,...targets.filter(t=>t!==control)];
  const limitIndex=process.argv.indexOf('--limit');if(limitIndex>=0){const n=Number(process.argv[limitIndex+1]);if(!Number.isInteger(n)||n<1||n>25)throw Error('SAMPLE_LIMIT');targets=controlPublic?[]:targets.slice(0,n);}
  for(let i=0;i<targets.length;i+=25){const file=out+'/targets.json';fs.writeFileSync(file,JSON.stringify(targets.slice(i,i+25)),{mode:0o600});const result=pipeline([skuMode?'--foreign-sku-prices':'--foreign-api-prices','--targets-file',file]);applyBatchAttributes(result);rows.push(row('MODEL_BATCH_TARGETS_'+Math.min(i+25,targets.length)));save();if(result.proof.some(r=>r.status==='ACCESS_BLOCKED')){rows.push(row('COUNTRY_API_ACCESS_BLOCKED'));break;}if(![0,2].includes(result.status))throw Error('COUNTRY_PIPELINE_FAILED');}
 }else if(!blocked){
 const byCode=new Map(),alternates=new Map(),alt=root+'/crawler/completeness/louis-vuitton/published-alternates';
 if(fs.existsSync(alt+'/summary.json')){guard(alt+'/summary.json');for(const p of JSON.parse(fs.readFileSync(alt+'/links.json')))if(p.country===cfg.country){try{louisVuittonForeignUrl(p.url,cfg,p.code);byCode.set(p.code,p.url);alternates.set(p.code,p);}catch{}}}
 let sitemap=prior.filter(r=>r.proof.some(p=>p.status==='DISCOVERY_ONLY_NOT_INGESTED')&&Date.now()-fs.statSync(r.file).mtimeMs<7*86400000).at(-1);
 if(!sitemap&&!alternates.size){sitemap=pipeline(['--crawl-only','--probe-sitemap-source']);if(sitemap.status!==0)throw Error(sitemap.proof.some(r=>r.status==='ACCESS_BLOCKED')?'SITEMAP_ACCESS_BLOCKED':'SITEMAP_DISCOVERY_FAILED');}
 const urls=sitemap?JSON.parse(fs.readFileSync(sitemap.dir+'/artifacts/discovery-candidates.json')):[];
 for(const url of urls){const code=louisVuittonCode(url);try{louisVuittonForeignUrl(url,cfg,code);}catch{continue;}if(!byCode.has(code))byCode.set(code,url);}
 const attempted=new Set(prior.flatMap(r=>r.proof.filter(p=>p.parentModel===transport&&p.variantCode!=='RUN').map(p=>p.officialUrl)));
 let targets=references.filter(r=>byCode.has(r.normalized_code)).map(r=>({code:r.normalized_code,url:byCode.get(r.normalized_code),sourceRun:sitemap?.dir,...(alternates.has(r.normalized_code)?{sourceKind:'alternate'}:{})}));
 rows.push(row('PUBLISHED_MATCHES_'+targets.length),row('UNLISTED_REFERENCE_'+(references.length-targets.length)));
 const control=targets.find(r=>r.code==='M29090');if(control)targets=[control,...targets.filter(r=>r!==control)];
 if(!process.argv.includes('--refresh'))targets=targets.filter(t=>!attempted.has(t.url));
 const limitIndex=process.argv.indexOf('--limit');if(limitIndex>=0){const n=Number(process.argv[limitIndex+1]);if(!Number.isInteger(n)||n<1||n>25)throw Error('SAMPLE_LIMIT');targets=controlPublic?[]:n===1&&control?[control]:targets.slice(0,n);}
 for(let offset=0;offset<targets.length;offset+=25){const file=out+'/targets.json';fs.writeFileSync(file,JSON.stringify(targets.slice(offset,offset+25)),{mode:0o600});const result=pipeline([rendered?'--foreign-prices-browser':'--foreign-prices','--targets-file',file]);const count=result.proof.find(r=>r.status.startsWith('NEXT_OFFSET_'))?.status.slice(12)??'0';rows.push(row('BATCH_REQUESTS_'+count));save();if(result.proof.some(r=>r.status==='ACCESS_BLOCKED')){rows.push(row('COUNTRY_ACCESS_BLOCKED'));break;}if(![0,2].includes(result.status))throw Error('COUNTRY_PIPELINE_FAILED');}
 }else rows.push(row('COUNTRY_ACCESS_STOP_RETAINED'));
 const publicMarkets=[];for(let offset=0;offset<10000;offset+=500){const page=guardedRest('market_products?country_code=eq.'+cfg.country+'&select=variant_id,official_product_code,current_price,currency_code,official_url,price_status&order=id&limit=500&offset='+offset,'GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);publicMarkets.push(...page);if(page.length<500)break;}
 let linked=0,confirmed=0;for(const reference of references){const matches=publicMarkets.filter(m=>m.variant_id===reference.id&&m.official_product_code===reference.normalized_code);if(matches.length!==1)continue;const m=matches[0];try{louisVuittonForeignUrl(m.official_url,cfg,reference.normalized_code);}catch{continue;}if(m.currency_code!==cfg.currency)continue;linked++;if(Number(m.current_price)>0&&m.price_status==='confirmed')confirmed++;}
 rows.push(row('PUBLIC_LINKED_'+linked),row('PUBLIC_PRICE_CONFIRMED_'+confirmed),row('UNPROCESSED_'+(references.length-linked)),row(confirmed===references.length?'COUNTRY_COLLECTION_VERIFIED':'COUNTRY_COLLECTION_INCOMPLETE'));if(confirmed!==references.length)process.exitCode=2;
}catch(e){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'COUNTRY_MARKET_FAILED'));process.exitCode=/SECURITY_VERIFICATION|GUARD|SAFETY|LIMIT/.test(e.message)?78:2;}
finally{save();}
