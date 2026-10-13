import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {validBottegaMarket,recordBottegaFailures,missingBottegaMarkets} from '../crawler/common/bottega-progress.js';
const root=path.resolve(import.meta.dirname,'..'),country=process.argv[2];if(!/^(jp|fr|it|es|us|sg|hk)$/.test(country)||spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/bottega-veneta/countries',country))),folder=path.join(root,'crawler/completeness/bottega-veneta/country-targets',country),targetSummary=path.join(folder,'summary.json');if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[targetSummary],{stdio:'ignore'}).status)throw Error('blocked');
const targets=new Map(JSON.parse(fs.readFileSync(path.join(folder,'targets.json'))).map(t=>[t.normalizedCode,t])),processed=new Set();let linked=0;
const usePublishedRoute=process.argv.includes('--published-route');if(usePublishedRoute)for(const r of JSON.parse(fs.readFileSync(path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json'))))if(!targets.has(r.normalizedCode))targets.set(r.normalizedCode,{normalizedCode:r.normalizedCode,parentModel:r.parentModel,sourceProductId:r.sourceProductId});
const failuresFile=path.join(folder,'unprocessed.json'),failures=new Map();
if(fs.existsSync(failuresFile))for(const r of JSON.parse(fs.readFileSync(failuresFile)))failures.set(r.variantCode,r);
const validMarket=(m,code)=>validBottegaMarket(m,code,cfg,targets.get(code));
const variants=[];for(let offset=0;;offset+=100){const rows=await guardedRest(`product_variants?brands.slug=eq.bottega-veneta&active=eq.true&select=normalized_code,brands!inner(slug),market_products(country_code,official_product_code,currency_code,current_price,official_url)&order=id&limit=100&offset=${offset}`);variants.push(...rows);if(rows.length<100)break;}
const ready=new Set(variants.filter(v=>v.market_products.some(m=>m.country_code==='KR'&&m.official_product_code===v.normalized_code)).map(v=>v.normalized_code));
if(process.argv.includes('--remaining'))for(const v of variants)if(v.market_products.some(m=>validMarket(m,v.normalized_code))){processed.add(v.normalized_code);failures.delete(v.normalized_code);}
const save=status=>{const file=path.join(folder,'progress/summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify([{brand:'bottega-veneta',country:cfg.country,parentModel:'한국 코드 국가 가격 적재',variantCode:'TOTAL',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}]));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('blocked');};
while(true){
 const batch=[...targets.values()].filter(t=>ready.has(t.normalizedCode)&&!processed.has(t.normalizedCode)).slice(0,20);if(!batch.length)break;
 const file=path.join(folder,'current-price-targets.json');fs.writeFileSync(file,JSON.stringify(batch),{mode:0o600});save(`PRICE_BATCH_${linked}_OF_${targets.size}`);
 const log=fs.openSync(path.join(folder,`price-${linked}.private-log`),'w',0o600),result=spawnSync(path.join(root,'scripts/run-brand-country-pipeline.sh'),['bottega-veneta',country,usePublishedRoute?'--prices-from-published-route':'--prices-only','--targets-file',file],{cwd:root,env:process.env,stdio:['ignore',log,log],timeout:600000});fs.closeSync(log);
 if(result.status!==0){save(result.status===78?'SAFETY_POLICY_BLOCKED':'PRICE_BATCH_FAILED');process.exitCode=result.status??1;break;}
 const base=path.join(root,'crawler/runs/bottega-veneta',country),dir=path.join(base,fs.readdirSync(base).sort().at(-1)),summary=path.join(dir,'summary.json');if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status)throw Error('blocked');
 const actualRows=JSON.parse(fs.readFileSync(summary));
 batch.forEach(t=>processed.add(t.normalizedCode));linked+=actualRows.filter(r=>r.status==='confirmed').length;
 recordBottegaFailures(failures,actualRows);
 fs.writeFileSync(failuresFile,JSON.stringify([...failures.values()]),{mode:0o600});
 const extras=path.join(dir,'artifacts/extra-native-targets.json');if(fs.existsSync(extras))for(const t of JSON.parse(fs.readFileSync(extras)))if(!targets.has(t.normalizedCode)||!targets.get(t.normalizedCode).officialUrl)targets.set(t.normalizedCode,t);
 fs.writeFileSync(path.join(folder,'targets.json'),JSON.stringify([...targets.values()].filter(t=>t.officialUrl)),{mode:0o600});save(`BATCH_VERIFIED_${linked}`);
}
if(!process.exitCode){
 const stored=[];for(let offset=0;;offset+=100){const rows=await guardedRest(`product_variants?brands.slug=eq.bottega-veneta&active=eq.true&select=normalized_code,brands!inner(slug),market_products(country_code,official_product_code,currency_code,current_price,price_status,official_url)&order=id&limit=100&offset=${offset}`);stored.push(...rows);if(rows.length<100)break;}
 const missing=missingBottegaMarkets(ready,stored,cfg,targets);
 fs.writeFileSync(failuresFile,JSON.stringify([...failures.values()]),{mode:0o600});
 save(missing.length?`DB_UNPROCESSED_${missing.length}`:`DB_COMPLETE_${ready.size}`);if(missing.length)process.exitCode=1;
}
