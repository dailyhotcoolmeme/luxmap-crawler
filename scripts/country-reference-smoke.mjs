import fs from 'node:fs';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||process.argv.slice(2).join(' ')!=='--country-reference-smoke')throw Error('COORDINATED_SAMPLE_REQUIRED');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)process.exit(78);
const brands=['chanel','prada','bottega-veneta','van-cleef-arpels','rolex'],countries=['jp','fr','it','es','us','sg','hk'];
const folder=path.join(root,'crawler/service/country-samples'),seedFile=path.join(root,'crawler/service/weekly-samples/summary.json');
const guard=file=>fs.existsSync(file)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status===0;
if(!guard(seedFile))throw Error('KR_SAMPLE_UNVERIFIED');
const seeds=JSON.parse(fs.readFileSync(seedFile));
if(seeds.length!==5||brands.some(brand=>seeds.filter(s=>s.brand===brand&&s.country==='KR'&&s.status==='SAMPLE_PRICE_HISTORY_IMAGE_VERIFIED').length!==1))throw Error('KR_SAMPLE_SCOPE_INVALID');
const rows=seeds.map(s=>({...s,status:'PREVIOUS_KR_SAMPLE_VERIFIED'}));
fs.mkdirSync(folder,{recursive:true});
const report=()=>{const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify(rows),{mode:0o600});if(!guard(file))throw Error('SUMMARY_BLOCKED');};report();
let safety=false,failed=false,cursor=0;
const active=new Set();
const normalize=s=>s?.replace(/[^a-z0-9]/gi,'').toUpperCase();
function publicVariant(brand,code,key){return guardedRest(`product_variants?brands.slug=eq.${brand}&normalized_code=eq.${code}&select=id,normalized_code,brands!inner(slug),market_products(id,country_code,official_product_code,official_url,currency_code,current_price,price_checked_at),product_media(is_primary,sha256,r2_object_key)`,'GET',undefined,key);}
function pipeline(brand,country,args){return new Promise(resolve=>{
 const child=spawn(path.join(root,'scripts/run-brand-country-pipeline.sh'),[brand,country,...args],{cwd:root,env:process.env,stdio:'ignore'});active.add(child);
 const timer=setTimeout(()=>{safety=true;child.kill('SIGTERM');},600000);
 child.once('error',()=>{clearTimeout(timer);active.delete(child);resolve(78);});
 child.once('exit',(code,signal)=>{clearTimeout(timer);active.delete(child);resolve(signal||code===78?78:code??1);});
});}
async function runBrand(brand){
 const seed=seeds.find(s=>s.brand===brand),before=publicVariant(brand,seed.variantCode),v=before[0];
 if(before.length!==1)throw Error('KR_REFERENCE_NOT_UNIQUE');
 const media=JSON.stringify(v.product_media.filter(m=>m.is_primary));let blocked=false;
 for(const country of countries){
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries',country))),market=v.market_products.find(m=>m.country_code===cfg.country&&m.official_product_code===seed.variantCode),home=cfg.entryUrl??cfg.listingUrls[0];
  let status,price=null,url=market?.official_url??home,run;
  try{
   if(safety){status='NOT_RUN_SAFETY_STOP';failed=true;}
   else if(blocked){status='NOT_RUN_ACCESS_BLOCKED';failed=true;}
   else{
    const job=path.join(folder,brand,country);fs.mkdirSync(job,{recursive:true});const file=path.join(job,'urls.json');
    let args;
    if(['van-cleef-arpels','rolex'].includes(brand)){
     const target=path.join(root,'crawler/onboarding',brand,'foreign',country,'same-kr-sample.json');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify([seed.officialUrl]),{mode:0o600});args=['--reference-urls-file',target];
    }else{
     if(!market||market.currency_code!==cfg.currency)throw Error('OFFICIAL_COUNTRY_REFERENCE_MISSING');
     const target=new URL(market.official_url);if(target.protocol!=='https:'||!cfg.allowedHosts.includes(target.hostname)||target.username||target.password)throw Error('COUNTRY_REFERENCE_INVALID');
     fs.writeFileSync(file,JSON.stringify([market.official_url]),{mode:0o600});
     if(brand==='bottega-veneta'){const f=path.join(job,'targets.json');fs.writeFileSync(f,JSON.stringify([{normalizedCode:seed.variantCode,officialUrl:market.official_url}]),{mode:0o600});args=['--prices-from-published-route','--targets-file',f];}
     else args=['--urls-file',file,...(brand==='prada'?['--prices-only']:['--max-products','1','--navigation-retries','0'])];
    }
    const started=Date.now(),exit=await pipeline(brand,country,args),base=path.join(root,'crawler/runs',brand,country);run=path.join(base,fs.readdirSync(base).sort().at(-1));const f=path.join(run,'summary.json');
    if(exit===78){safety=true;for(const child of active)child.kill('SIGTERM');throw Error('SAFETY_STOP');}
    if(!guard(f)||fs.statSync(f).mtimeMs<started)throw Error('SAMPLE_SOURCE_UNVERIFIED');
    const source=JSON.parse(fs.readFileSync(f));if(source.some(s=>/UNAUTHORIZED|SANDBOX|TOKEN|NETWORK_POLICY/.test(s.status))){safety=true;for(const child of active)child.kill('SIGTERM');throw Error('SAFETY_STOP');}
    if(source.some(s=>/ACCESS_BLOCKED|HTTP_403|HTTP_429/.test(s.status))){blocked=true;throw Error('ACCESS_BLOCKED');}
    if(exit!==0)throw Error(source.find(s=>normalize(s.variantCode)===seed.variantCode&&s.price===null&&!/READY|UNPUBLISHED|confirmed|price_unavailable/.test(s.status))?.status??'COLLECTION_OR_STORAGE_FAILED');
    const recordFile=path.join(run,'artifacts/records.json'),mode=fs.statSync(recordFile).mode&0o777;let records;try{fs.chmodSync(recordFile,0o600);records=JSON.parse(fs.readFileSync(recordFile));}finally{fs.chmodSync(recordFile,mode);}
    const row=records[0];if(records.length!==1||normalize(row.normalizedCode)!==seed.variantCode||row.country!==cfg.country||row.currency!==cfg.currency)throw Error('SAMPLE_SKU_OR_CURRENCY_MISMATCH');
    price=row.price;url=row.officialUrl;
    const after=publicVariant(brand,seed.variantCode,process.env.EXPO_PUBLIC_SUPABASE_KEY),current=after[0],m=current?.market_products.find(m=>m.country_code===cfg.country&&m.official_product_code===seed.variantCode);
    if(after.length!==1||current.id!==v.id||JSON.stringify(current.product_media.filter(m=>m.is_primary))!==media)throw Error('KR_ID_OR_IMAGE_CHANGED');
    if(!m||m.currency_code!==cfg.currency||m.official_url!==url||Date.parse(m.price_checked_at)<started||price!==null&&Number(m.current_price)!==price)throw Error('SAMPLE_PUBLIC_MARKET_MISMATCH');
    if(price!==null){const h=guardedRest(`price_history?market_product_id=eq.${m.id}&select=amount,currency_code&order=observed_at.desc&limit=1`)[0];if(!h||Number(h.amount)!==price||h.currency_code!==cfg.currency)throw Error('SAMPLE_HISTORY_MISMATCH');status='SAMPLE_COUNTRY_PRICE_VERIFIED';}
    else status='SAMPLE_PRICE_UNPUBLISHED_VERIFIED';
   }
  }catch(error){failed=true;status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'SAMPLE_FAILED';}
  rows.push({brand,country:cfg.country,parentModel:'한국과 동일 SKU 국가 표본',variantCode:seed.variantCode,price,currency:cfg.currency,status,officialUrl:url});report();
 }
}
await Promise.all([0,1].map(async()=>{while(cursor<brands.length){const brand=brands[cursor++];await runBrand(brand);}}));
process.exitCode=safety?78:failed?1:0;
