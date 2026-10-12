import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parsePradaProduct,isPradaBag} from '../crawler/common/prada-product.js';
import {classifyPradaCandidate} from '../crawler/common/catalog-completeness.js';
const root=path.resolve(import.meta.dirname,'..'),state=path.join(root,'crawler/completeness/prada'),ledgerFile=path.join(state,'ledger.json');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('preflight blocked');
const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/prada/countries/kr'))),map=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/prada/parent-model-map.json'))),ledger=JSON.parse(fs.readFileSync(ledgerFile));
const wanted=new Set(JSON.parse(fs.readFileSync(path.join(state,'universe-urls.json'))).map(url=>decodeURIComponent(new URL(url).pathname.split('/').at(-1)).replace(/[^a-z0-9]/gi,'').toUpperCase())),fresh=Date.now()-86400000;
function read(file){const mode=fs.statSync(file).mode&0o777;try{fs.chmodSync(file,0o600);return fs.readFileSync(file,'utf8');}finally{fs.chmodSync(file,mode);}}
let updated=0;const folder=path.join(root,'crawler/runs/prada/kr');
for(const name of fs.readdirSync(folder).sort()){
 const dir=path.join(folder,name),summary=path.join(dir,'summary.json'),records=path.join(dir,'artifacts/records.json');
 if(fs.existsSync(path.join(dir,'failure.json'))||!fs.existsSync(records)||!fs.existsSync(summary)||fs.statSync(summary).mtimeMs<fresh)continue;
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status)throw Error('source summary blocked');
 for(const row of JSON.parse(read(records))){
  if(!wanted.has(row.normalizedCode)||row.country!=='KR'||row.currency!=='KRW'||!(Date.parse(row.checkedAt)>fresh))continue;
  // An audit timestamps a completed batch after each page's observation time.
  // Account for that bounded lag without admitting an older day's evidence.
  if(ledger[row.normalizedCode]?.checkedAt>Date.parse(row.checkedAt)+10*60000)continue;
  const raw=path.join(dir,'raw',`${row.normalizedCode}.html`);if(!fs.existsSync(raw))continue;
  let parsed;try{parsed=parsePradaProduct(read(raw),row.officialUrl,config,map,{requireImage:false});}catch(error){if(error.failureCode==='EXACT_PRODUCT_MISSING')continue;throw error;}
  const decision=classifyPradaCandidate(parsed,isPradaBag);if(ledger[row.normalizedCode]?.decision!==decision)updated++;
  ledger[row.normalizedCode]={decision,checkedAt:Date.parse(row.checkedAt),url:row.officialUrl,sourceRun:name};
 }
}
fs.writeFileSync(ledgerFile,JSON.stringify(ledger),{mode:0o600});const file=path.join(state,'reconcile-summary','summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify([{brand:'prada',country:'KR',parentModel:'공식 카테고리 증거 재대조',variantCode:'AUDIT',price:null,currency:'KRW',status:`RECLASSIFIED_${updated}`,officialUrl:config.listingUrls[0]}]));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('reconcile summary blocked');
