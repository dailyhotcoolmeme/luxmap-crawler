import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
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
 if(result.status!==0){process.exitCode=result.status===78?78:1;throw Object.assign(new Error('guarded pipeline failed'),{failureCode:/FAILED: ([A-Z_]+)/.exec(result.stderr?.toString()??'')?.[1]??'PIPELINE_FAILED'});}
 return path.join(root,'crawler/runs/prada',country,latestRun());
}
function writeSummary(rows,phase){
 const summary=rows.map(row=>({brand:'prada',country:config.country,parentModel:'한국 기준',variantCode:row.normalized_code,price:null,currency:config.currency,status:phase,officialUrl:row.official_url?.length<=500?row.official_url:config.listingUrls[0]}));
 if(!summary.length)summary.push({brand:'prada',country:config.country,parentModel:'한국 기준',variantCode:'RUN',price:null,currency:config.currency,status:phase,officialUrl:config.listingUrls[0]});
 for(let i=0;i<summary.length;i+=25){const file=path.join(state,i===0?'summary.json':`summary-${i/25}.json`);fs.writeFileSync(file,JSON.stringify(summary.slice(i,i+25)));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('progress summary blocked');}
}
async function verify(){
 const rows=await references(),markets=[];
 for(let offset=0;;offset+=500){const batch=await query(`market_products?country_code=eq.${config.country}&select=variant_id,official_product_code,current_price,currency_code,official_url&order=id&limit=500&offset=${offset}`);markets.push(...batch);if(batch.length<500)break;}
 const summaries=rows.map(row=>{const market=markets.find(item=>item.variant_id===row.id);const valid=market&&market.official_product_code===row.normalized_code&&market.currency_code===config.currency&&market.official_url.startsWith(`https://www.prada.com${config.referenceDetailPrefix}`)&&decodeURIComponent(new URL(market.official_url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()===row.normalized_code;return {brand:'prada',country:config.country,parentModel:'한국 기준',variantCode:row.normalized_code,price:valid?Number(market.current_price)||null:null,currency:config.currency,status:valid?(market.current_price==null?'price_unavailable':'confirmed'):'unprocessed',officialUrl:market?.official_url?.length<=500?market.official_url:config.listingUrls[0]};});
 let discoveryMissing=0;
 if(country==='kr'){
  const runs=path.join(root,'crawler/runs/prada/kr');const discovery=fs.readdirSync(runs).sort().reverse().find(name=>fs.existsSync(path.join(runs,name,'artifacts/discovered-urls.json')));
  if(!discovery)throw new Error('discovery baseline missing');const urls=JSON.parse(fs.readFileSync(path.join(runs,discovery,'artifacts/discovered-urls.json')));const codes=new Set(rows.map(row=>row.normalized_code));discoveryMissing=urls.filter(url=>!codes.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase())).length;
 }
 for(let i=0;i<summaries.length;i+=25){const file=path.join(state,i===0?'summary.json':`summary-${i/25}.json`);fs.writeFileSync(file,JSON.stringify(summaries.slice(i,i+25)));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('verification summary blocked');}
 const report=[['REFERENCE',rows.length],['LINKED',summaries.filter(r=>r.status!=='unprocessed').length],['CONFIRMED',summaries.filter(r=>r.status==='confirmed').length],['UNAVAILABLE',summaries.filter(r=>r.status==='price_unavailable').length],['UNPROCESSED',summaries.filter(r=>r.status==='unprocessed').length],['DISCOVERY_MISSING',discoveryMissing]].map(([label,count])=>({brand:'prada',country:config.country,parentModel:'검증 합계',variantCode:'TOTAL',price:null,currency:config.currency,status:`${label}_${count}`,officialUrl:config.listingUrls[0]}));
 const folder=path.join(state,'report');fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'summary.json');fs.writeFileSync(file,JSON.stringify(report));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw new Error('report blocked');
 if(!rows.length||discoveryMissing||summaries.some(row=>row.status==='unprocessed'))throw Object.assign(new Error('incomplete country coverage'),{failureCode:'INCOMPLETE_COVERAGE'});
}
try{
 if(process.argv.includes('--verify-only')){
  await verify();
 }else if(process.argv.includes('--discover-reference')){
  if(country!=='kr')throw new Error('foreign discovery forbidden');
  const run=pipeline(['--crawl-only','--discover']);
  let urls=JSON.parse(fs.readFileSync(path.join(run,'artifacts/discovered-urls.json')));
  if(process.argv.includes('--remaining')){const existing=new Set((await references()).map(row=>row.normalized_code));urls=urls.filter(url=>!existing.has(decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase()));}
  for(let i=0;i<urls.length;i+=8){const file=path.join(state,'batch-urls.json');fs.writeFileSync(file,JSON.stringify(urls.slice(i,i+8)));writeSummary([{normalized_code:'DISCOVERY',official_url:config.listingUrls[0]}],`INGESTING_${i}_OF_${urls.length}`);const extra=[];if(process.argv.includes('--remaining')){const excluded=path.join(state,'existing-codes.json');fs.writeFileSync(excluded,JSON.stringify((await references()).map(row=>row.normalized_code)));extra.push('--exclude-codes-file',excluded);}pipeline(['--urls-file',file,'--expand-variants',...extra]);}
 }else{
  const rows=await references();if(!rows.length)throw new Error('Korean reference missing');
  const limitIndex=process.argv.indexOf('--limit'),selected=limitIndex>=0?rows.slice(0,Number(process.argv[limitIndex+1])):rows;
  for(let i=0;i<selected.length;i+=20){const batch=selected.slice(i,i+20);const file=path.join(state,'batch-urls.json');fs.writeFileSync(file,JSON.stringify(batch.map(row=>{const source=new URL(row.official_url);if(source.origin!=='https://www.prada.com'||!source.pathname.startsWith('/kr/ko/p/'))throw new Error('invalid Korean source');source.pathname=source.pathname.replace('/kr/ko/p/',config.referenceDetailPrefix);return source.href;})));writeSummary(batch,`PROCESSING_${i}_OF_${selected.length}`);pipeline(['--urls-file',file]);}
 }
 await verify();
}catch(error){writeSummary([{normalized_code:'FAILED',official_url:config.listingUrls[0]}],error.failureCode??'FAILED');process.exitCode??=1;}
