import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),[brand,mode,offset]=process.argv.slice(2);
import fs from 'node:fs';
if(process.env.LUXURY_SERVICE_GUARD==='enabled'&&brand==='hermes'&&['--prices-country','--prices-sitemap-country','--prices-search-country','--prices-mapped-country','--prices-facet-country','--prices-render-country'].includes(mode)&&process.argv.length===5){
 const safetyStop=root+'/crawler/onboarding/hermes/foreign-safety-stop.json';
 if(fs.existsSync(safetyStop))process.exit(78);
 const sitemap=mode==='--prices-sitemap-country',search=mode==='--prices-search-country',mapped=mode==='--prices-mapped-country',facets=mode==='--prices-facet-country',render=mode==='--prices-render-country',limited=search||mapped||facets;
 const countries=offset==='all'?(limited?['jp','sg']:['jp','fr','it','es','us','sg','hk']):[offset];if(countries.some(c=>!(limited?['jp','sg']:['jp','fr','it','es','us','sg','hk']).includes(c)))throw Error('COUNTRY_SCOPE_INVALID');
 const guard=file=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(file));};let failed=false;
 for(const country of countries){
  const cfg=JSON.parse(fs.readFileSync(root+`/crawler/brands/hermes/countries/${country}`)),folder=root+`/crawler/onboarding/hermes/${render?'foreign-render':facets?'foreign-facets':mapped?'foreign-mapped':search?'foreign-search':sitemap?'foreign-sitemap':'foreign'}/${country}`;fs.mkdirSync(folder,{recursive:true});
  const checkpoint=folder+'/checkpoint.json',report=status=>{const file=folder+'/summary.json';fs.writeFileSync(file,JSON.stringify([{brand:'hermes',country:cfg.country,parentModel:'동일 한국 SKU 해외 가격',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}]));guard(file);};
  let start=0,incomplete=false;
  if(fs.existsSync(checkpoint)){const old=JSON.parse(fs.readFileSync(checkpoint));if(old.complete){failed||=old.failed;continue;}start=old.nextOffset;}
  try{
   if(facets||render){
    const file=root+`/crawler/brands/hermes/.foreign-${render?'render':'facets'}-${country}.json`;let state;try{state=JSON.parse(fs.readFileSync(file));}catch(e){if(e.code!=='ENOENT')throw e;}
    if(!state?.discoveryComplete)for(let batch=0;batch<10;batch++){
     report(render?'RENDERING_OFFICIAL_LISTING':'DISCOVERING_OFFICIAL_FACETS');const result=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['hermes',country,'--crawl-only',render?'--render-foreign-listing':'--discover-foreign-facets'],{cwd:root,env:render?{...process.env,LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_BROWSER_REJECT_UNLISTED:'1'}:process.env,stdio:'ignore',timeout:600000});
     if(result.status===78)throw Error('SAFETY_STOP');
     const base=root+`/crawler/runs/hermes/${country}`,run=base+'/'+fs.readdirSync(base).sort().at(-1),rows=guard(run+'/summary.json');
     if(result.status===78)throw Error('SAFETY_STOP');if(result.status!==0)throw Error(rows.some(r=>/BLOCKED/.test(r.status))?'COUNTRY_ACCESS_BLOCKED':'FACET_DISCOVERY_FAILED');
     if(rows.some(r=>r.status==='FACET_DISCOVERY_COMPLETE'))break;if(!rows.some(r=>r.status==='FACET_DISCOVERY_PENDING')||batch===9)throw Error('FACET_PROGRESS_INVALID');
    }
   }
   for(let n=start;n<10000;){
   report('RUNNING_OFFSET_'+n);
   const result=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',['hermes',country,render?'--prices-render-offset':facets?'--prices-facet-offset':mapped?'--prices-mapped-offset':search?'--prices-search-offset':sitemap?'--prices-sitemap-offset':'--prices-offset',String(n)],{cwd:root,env:process.env,stdio:'ignore',timeout:600000});
   if(result.status===78)throw Error('SAFETY_STOP');
   const base=root+`/crawler/runs/hermes/${country}`,run=base+'/'+fs.readdirSync(base).sort().at(-1),rows=guard(run+'/summary.json');
   if(result.status===78||rows.some(r=>/UNAUTHORIZED|LIMIT|GUARD|SANDBOX|TOKEN|NETWORK_POLICY/.test(r.status)))throw Error('SAFETY_STOP');
   if(![0,2].includes(result.status))throw Error(rows.some(r=>/BLOCKED/.test(r.status))?'COUNTRY_ACCESS_BLOCKED':'COLLECTION_OR_STORAGE_FAILED');
   const stored=guard(run+'/artifacts/verified/summary.json'),ready=rows.filter(r=>r.status==='COUNTRY_PRICE_READY');
   if(stored.length!==ready.length||ready.some(r=>!stored.some(s=>s.status==='COUNTRY_MARKET_VERIFIED'&&s.variantCode===r.variantCode&&s.price===r.price&&s.officialUrl===r.officialUrl)))throw Error('STORAGE_VERIFICATION_MISMATCH');
   const next=Number(rows.find(r=>r.status.startsWith('NEXT_OFFSET_'))?.status.slice(12)),left=Number(rows.find(r=>r.status.startsWith('REMAINING_'))?.status.slice(10));if(!Number.isInteger(next)||next<=n||!Number.isInteger(left)||left<0)throw Error('PROGRESS_INVALID');
   incomplete||=result.status===2;fs.writeFileSync(checkpoint,JSON.stringify({nextOffset:next,complete:left===0,failed:incomplete,lastRun:run}),{mode:0o600});if(left===0){report(incomplete?'FINISHED_WITH_UNPROCESSED':'ALL_LISTED_REFERENCE_PRICES_STORED');break;}n=next;
  }}catch(e){failed=true;report(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'COUNTRY_RUN_FAILED');if(e.message==='SAFETY_STOP'){fs.writeFileSync(safetyStop,JSON.stringify({status:'SAFETY_STOP',mode,country,checkedAt:new Date().toISOString()}),{mode:0o600});process.exit(78);}}
  failed||=incomplete;
 }
 process.exit(failed?1:0);
}
const hermesBatch=brand==='hermes'&&mode==='--recover-source-run'&&process.argv.length===7&&process.argv[5]==='--batch-offset'&&/^\d+$/.test(process.argv[6]??'');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!['bulgari','hermes'].includes(brand)||(brand==='hermes'&&!['--recover-source-run','--image-refresh-file'].includes(mode))||!['--batch-offset','--recover-source-run',...(brand==='hermes'?['--image-refresh-file']:[])].includes(mode)||(mode==='--batch-offset'&&!/^\d+$/.test(offset??''))||(!hermesBatch&&process.argv.length!==5))throw Error('GUARDED_REFERENCE_REQUIRED');
const child=spawnSync(root+'/scripts/run-brand-country-pipeline.sh',[brand,'kr',...process.argv.slice(3)],{cwd:root,env:process.env,stdio:'ignore',timeout:1800000,killSignal:'SIGTERM'});
process.exitCode=child.status??1;
