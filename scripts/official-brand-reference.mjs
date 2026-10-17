import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),[brand,mode,offset]=process.argv.slice(2);
import fs from 'node:fs';
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&['--prices-api-country','--prices-api-control','--prices-sku-country'].includes(mode)&&['all','jp','fr','it','es','us','sg','hk'].includes(offset)&&process.argv.length===5){
 let failed=false;for(const country of offset==='all'?['jp','fr','it','es','us','sg','hk']:[offset]){const p=spawnSync(process.execPath,[root+'/scripts/louis-vuitton-market.mjs',country,mode==='--prices-sku-country'?'--api-sku':'--api',...(mode==='--prices-api-control'?['--limit','1']:[])],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000});if(p.status===78)process.exit(78);failed||=p.status!==0;}process.exit(failed?2:0);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--prices-browser-country'&&['all','jp','fr','it','es','us','sg','hk'].includes(offset)&&process.argv.length===5){
 let failed=false;for(const country of offset==='all'?['us','sg','jp','fr','it','es','hk']:[offset]){const p=spawnSync(process.execPath,[root+'/scripts/louis-vuitton-market.mjs',country,'--browser','--limit','1'],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000});if(p.status===78)process.exit(78);failed||=p.status!==0;}process.exit(failed?2:0);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--prices-country'&&['all','jp','fr','it','es','us','sg','hk'].includes(offset)&&process.argv.length===5){
 let failed=false;for(const country of offset==='all'?['jp','fr','it','es','us','sg','hk']:[offset]){const p=spawnSync(process.execPath,[root+'/scripts/louis-vuitton-market.mjs',country],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000});if(p.status===78)process.exit(78);failed||=p.status!==0;}process.exit(failed?2:0);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--collect-catalog-model'&&process.argv.length===4){
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr','--crawl-only',mode],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--render-country-attributes'&&offset==='us'&&process.argv.length===5){
 const restored=spawnSync(process.execPath,[root+'/scripts/restore-louis-vuitton-relay.mjs'],{cwd:root,env:process.env,stdio:'ignore',timeout:30000});if(restored.status)process.exit(restored.status??1);
 const meta=JSON.parse(fs.readFileSync(root+'/crawler/runtime/louis-vuitton-browser/session.json'));
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'us','--crawl-only',mode],{cwd:root,env:{...process.env,LUXURY_REUSE_CDP_URL:meta.cdp,LUXURY_BROWSER_SESSION_ID:'louis-vuitton-maintained'},stdio:'ignore',timeout:1200000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--discover-attributes-country'&&offset==='us'&&process.argv.length===5){
 const dir=root+'/crawler/completeness/louis-vuitton/us-listing-source';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');const rows=JSON.parse(fs.readFileSync(dir+'/summary.json')),target=rows.find(r=>r.status==='PUBLISHED_US_BAG_LIST');if(!target)throw Error('PUBLISHED_LISTING_REQUIRED');
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'us','--crawl-only','--inspect-listing','--listing-url',target.officialUrl],{cwd:root,env:process.env,stdio:'ignore',timeout:120000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--published-attributes-country'&&['us','jp'].includes(offset)&&process.argv.length===5){
 const folder=root+'/crawler/completeness/louis-vuitton/published-alternates';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[folder+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
 const target=JSON.parse(fs.readFileSync(folder+'/links.json')).find(r=>r.country===offset.toUpperCase());if(!target||new URL(target.url).origin!=='https://'+offset+'.louisvuitton.com')throw Error('PUBLISHED_COUNTRY_SOURCE');
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,offset,'--crawl-only','--collect-published-attributes'],{cwd:root,env:process.env,stdio:'ignore',timeout:1200000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&['--search-ui-price-sample','--capture-current-public-data','--render-reference-details','--render-published-source','--render-published-list','--expand-rendered-list'].includes(mode)&&process.argv.length===4){
 if(['--search-ui-price-sample','--capture-current-public-data','--render-published-source','--render-published-list','--expand-rendered-list'].includes(mode)){const restored=spawnSync(process.execPath,[root+'/scripts/restore-louis-vuitton-relay.mjs'],{env:process.env,stdio:'ignore'});if(restored.status)process.exit(restored.status??1);}
 const file=root+'/crawler/runtime/louis-vuitton-browser/session.json';let env={...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_BROWSER_REJECT_UNLISTED:'1'};
 if(['--search-ui-price-sample','--capture-current-public-data','--render-published-list','--expand-rendered-list'].includes(mode)&&!fs.existsSync(file))throw Error('EXISTING_SESSION_REQUIRED');
 if(fs.existsSync(file)){const session=JSON.parse(fs.readFileSync(file));if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(session.cdp))throw Error('SESSION_SCOPE');env.LUXURY_REUSE_CDP_URL=session.cdp;env.LUXURY_BROWSER_SESSION_ID='louis-vuitton-maintained';}
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr','--crawl-only',mode],{cwd:root,env,stdio:'ignore',timeout:1200000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--repair-metadata'&&process.argv.length===4){
 const child=spawnSync(process.execPath,[root+'/scripts/network-isolate.mjs','["nxgnbrdxxmlhtcnymqsl.supabase.co"]','0',process.execPath,root+'/scripts/repair-louis-vuitton-metadata.mjs'],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='louis-vuitton'&&mode==='--batch-offset'&&/^\d+$/.test(offset??'')&&process.argv.length===5){
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr',mode,offset],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000});process.exit(child.status??1);
}

if(brand==='louis-vuitton'){
 if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||mode!=='--batch-offset'||!/^\d+$/.test(offset??'')||process.argv.length!==5)throw Error('GUARDED_REFERENCE_REQUIRED');
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr',mode,offset],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000,killSignal:'SIGTERM'});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='dior'&&mode==='--recover-source-run'&&process.argv.length===5){
 const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['dior','kr',mode,offset],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000});process.exit(child.status??1);
}
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='hermes'&&['--prices-country','--prices-sitemap-country','--prices-search-country','--prices-mapped-country','--prices-facet-country','--prices-render-country','--prices-detail-country'].includes(mode)&&process.argv.length===5){
 const safetyStop=root+'/crawler/onboarding/hermes/foreign-safety-stop.json';
 if(fs.existsSync(safetyStop))process.exit(78);
 const details=mode==='--prices-detail-country',sitemap=mode==='--prices-sitemap-country',search=mode==='--prices-search-country',mapped=mode==='--prices-mapped-country',facets=mode==='--prices-facet-country',render=mode==='--prices-render-country'||details,limited=search||mapped||facets;
 const countries=offset==='all'?(limited?['jp','sg']:['jp','fr','it','es','us','sg','hk']):[offset];if(countries.some(c=>!(limited?['jp','sg']:['jp','fr','it','es','us','sg','hk']).includes(c)))throw Error('COUNTRY_SCOPE_INVALID');
 const guard=file=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(file));};let failed=false;
 for(const country of countries){
  const cfg=JSON.parse(fs.readFileSync(root+`/crawler/brands/hermes/countries/${country}`)),folder=root+`/crawler/onboarding/hermes/${details?'foreign-detail':render?'foreign-render':facets?'foreign-facets':mapped?'foreign-mapped':search?'foreign-search':sitemap?'foreign-sitemap':'foreign'}/${country}`;fs.mkdirSync(folder,{recursive:true});
  const checkpoint=folder+'/checkpoint.json',report=status=>{const file=folder+'/summary.json';fs.writeFileSync(file,JSON.stringify([{brand:'hermes',country:cfg.country,parentModel:'동일 한국 SKU 해외 가격',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}]));guard(file);};
  let start=0,incomplete=false;
  // One migration for the proven normal FR renderer: its French load-more
  // control was ignored by the old English/Japanese matcher. Never reopen a
  // halted/blocked cache or repeat this migration after it is recorded.
  if(mode==='--prices-render-country'&&country==='fr'){
   const file=root+'/crawler/brands/hermes/.foreign-render-fr.json';
   if(fs.existsSync(file)){const prior=JSON.parse(fs.readFileSync(file));
    if(prior.discoveryComplete&&!prior.halted&&!prior.blocked&&prior.paginationVersion!==2&&Array.isArray(prior.attempted)&&prior.attempted.length){
     guard(prior.sourceRun+'/summary.json');
     fs.copyFileSync(file,file+'.before-french-pagination');
     if(fs.existsSync(checkpoint))fs.renameSync(checkpoint,checkpoint+'.before-french-pagination');
     prior.pending=[...new Set(prior.attempted)];prior.attempted=[];prior.discoveryComplete=false;prior.paginationVersion=2;
     fs.writeFileSync(file,JSON.stringify(prior),{mode:0o600});
    }
   }
  }
  if(fs.existsSync(checkpoint)){const old=JSON.parse(fs.readFileSync(checkpoint));if(old.passFinished||old.complete){if(old.failed||old.needsFollowup){failed=true;report('FOLLOWUP_REQUIRED');}continue;}start=old.nextOffset;}
  try{
   if(facets||render){
    const file=root+`/crawler/brands/hermes/.foreign-${details?'detail':render?'render':'facets'}-${country}.json`;let state;try{state=JSON.parse(fs.readFileSync(file));}catch(e){if(e.code!=='ENOENT')throw e;}
    const maxBatches=details?JSON.parse(fs.readFileSync(root+'/crawler/brands/hermes/.reference-index.json')).products.length+1:10;
    if(!state?.discoveryComplete)for(let batch=0;batch<maxBatches;batch++){
     report(details?'RENDERING_EXACT_SKU_DETAIL':render?'RENDERING_OFFICIAL_LISTING':'DISCOVERING_OFFICIAL_FACETS');const result=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['hermes',country,'--crawl-only',details?'--render-foreign-details':render?'--render-foreign-listing':'--discover-foreign-facets'],{cwd:root,env:render?{...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_BROWSER_REJECT_UNLISTED:'1'}:process.env,stdio:'ignore',timeout:600000});
     if(result.status===78)throw Error('SAFETY_STOP');
     const base=root+`/crawler/runs/hermes/${country}`,run=base+'/'+fs.readdirSync(base).sort().at(-1),rows=guard(run+'/summary.json');
     if(result.status===78)throw Error('SAFETY_STOP');if(result.status!==0)throw Error(rows.some(r=>/BLOCKED/.test(r.status))?'COUNTRY_ACCESS_BLOCKED':'FACET_DISCOVERY_FAILED');
     if(rows.some(r=>r.status==='FACET_DISCOVERY_COMPLETE'))break;if(!rows.some(r=>r.status==='FACET_DISCOVERY_PENDING')||batch===maxBatches-1)throw Error('FACET_PROGRESS_INVALID');
    }
   }
   for(let n=start;n<10000;){
   report('RUNNING_OFFSET_'+n);
   const result=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['hermes',country,details?'--prices-detail-offset':render?'--prices-render-offset':facets?'--prices-facet-offset':mapped?'--prices-mapped-offset':search?'--prices-search-offset':sitemap?'--prices-sitemap-offset':'--prices-offset',String(n)],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});
   if(result.status===78)throw Error('SAFETY_STOP');
   const base=root+`/crawler/runs/hermes/${country}`,run=base+'/'+fs.readdirSync(base).sort().at(-1),rows=guard(run+'/summary.json');
   if(result.status===78||rows.some(r=>/UNAUTHORIZED|LIMIT|GUARD|SANDBOX|TOKEN|NETWORK_POLICY/.test(r.status)))throw Error('SAFETY_STOP');
   if(![0,2].includes(result.status))throw Error(rows.some(r=>/BLOCKED/.test(r.status))?'COUNTRY_ACCESS_BLOCKED':'COLLECTION_OR_STORAGE_FAILED');
   const stored=guard(run+'/artifacts/verified/summary.json'),ready=rows.filter(r=>r.status==='COUNTRY_PRICE_READY');
   if(stored.length!==ready.length||ready.some(r=>!stored.some(s=>s.status==='COUNTRY_MARKET_VERIFIED'&&s.variantCode===r.variantCode&&s.price===r.price&&s.officialUrl===r.officialUrl)))throw Error('STORAGE_VERIFICATION_MISMATCH');
   const next=Number(rows.find(r=>r.status.startsWith('NEXT_OFFSET_'))?.status.slice(12)),left=Number(rows.find(r=>r.status.startsWith('REMAINING_'))?.status.slice(10));if(!Number.isInteger(next)||next<=n||!Number.isInteger(left)||left<0)throw Error('PROGRESS_INVALID');
   incomplete||=result.status===2;fs.writeFileSync(checkpoint,JSON.stringify({nextOffset:next,passFinished:left===0,complete:left===0&&!incomplete,needsFollowup:left===0&&incomplete,failed:incomplete,lastRun:run}),{mode:0o600});if(left===0){report(incomplete?'FOLLOWUP_REQUIRED':'ALL_LISTED_REFERENCE_PRICES_STORED');break;}n=next;
  }}catch(e){failed=true;report(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'COUNTRY_RUN_FAILED');if(e.message==='SAFETY_STOP'){fs.writeFileSync(safetyStop,JSON.stringify({status:'SAFETY_STOP',mode,country,checkedAt:new Date().toISOString()}),{mode:0o600});process.exit(78);}}
  failed||=incomplete;
 }
 process.exit(failed?1:0);
}
const hermesBatch=brand==='hermes'&&mode==='--recover-source-run'&&process.argv.length===7&&process.argv[5]==='--batch-offset'&&/^\d+$/.test(process.argv[6]??'');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!['bulgari','hermes'].includes(brand)||(brand==='hermes'&&!['--recover-source-run','--image-refresh-file'].includes(mode))||!['--batch-offset','--recover-source-run',...(brand==='hermes'?['--image-refresh-file']:[])].includes(mode)||(mode==='--batch-offset'&&!/^\d+$/.test(offset??''))||(!hermesBatch&&process.argv.length!==5))throw Error('GUARDED_REFERENCE_REQUIRED');
const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr',...process.argv.slice(3)],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000,killSignal:'SIGTERM'});
process.exitCode=child.status??1;
