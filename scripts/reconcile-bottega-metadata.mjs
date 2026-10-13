import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {parseBottegaProduct} from '../crawler/common/bottega-product.js';
import {bottegaModel} from '../crawler/common/bottega-model.js';
import {decodeHtml} from '../crawler/common/prada-product.js';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'crawler/runs/bottega-veneta/kr'),cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/bottega-veneta/countries/kr')));
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
if(process.argv.slice(2).some(arg=>!['--preserve-stored-references','--fresh-only'].includes(arg)))throw Error('INVALID_ARGUMENT');
const freshSince=process.argv.includes('--fresh-only')?fs.statSync(path.join(root,'crawler/completeness/bottega-veneta/audit-start.json')).mtimeMs:0;
const preserve=process.argv.includes('--preserve-stored-references'),previousFolder=path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata');
let previous=[];
if(preserve){if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(previousFolder,'summary.json')],{stdio:'ignore'}).status)throw Error('PREVIOUS_REFERENCE_UNVERIFIED');previous=JSON.parse(fs.readFileSync(path.join(previousFolder,'validated-products.json')));if(!Array.isArray(previous)||previous.some(r=>!/^[A-Z0-9]{15}$/.test(r.normalizedCode)||r.country!=='KR'||r.currency!=='KRW'||!r.officialCategories.includes('Bags')))throw Error('INVALID_PREVIOUS_REFERENCE');}
const dirs=fs.readdirSync(base).sort(),sourceDir=dirs.toReversed().map(d=>path.join(base,d)).find(d=>fs.existsSync(path.join(d,'artifacts/catalog-source-products.json'))),source=JSON.parse(fs.readFileSync(path.join(sourceDir,'artifacts/catalog-source-products.json'))),byCode=new Map(source.map(p=>[p.sku.toUpperCase(),p]));
const listedFile=path.join(sourceDir,'artifacts/catalog-listed-source-products.json'),listed=fs.existsSync(listedFile)?new Set(JSON.parse(fs.readFileSync(listedFile)).map(p=>p.sku.toUpperCase())):new Set();
const result=new Map(),excluded=new Map(),pending=new Map();
if(preserve)for(const r of previous)if(!byCode.has(r.normalizedCode))byCode.set(r.normalizedCode,{sku:r.normalizedCode,url:r.officialUrl});
for(const name of dirs){
 const dir=path.join(base,name),summary=path.join(dir,'summary.json');if(!fs.existsSync(summary)||spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status)continue;
 const records=JSON.parse(fs.readFileSync(summary));if(!records.some(r=>byCode.has(r.variantCode)))continue;
 for(const raw of fs.readdirSync(path.join(dir,'raw')).filter(n=>/^\d+\.source$/.test(n))){
  const f=path.join(dir,'raw',raw),stat=fs.statSync(f),mode=stat.mode&0o777;if(stat.mtimeMs<freshSince)continue;let html;try{fs.chmodSync(f,0o600);html=fs.readFileSync(f,'utf8');}finally{fs.chmodSync(f,mode);}
  const text=decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ');
  const codes=[...new Set([...text.matchAll(/(?:제품\s*코드|제품\s*번호|상품\s*코드|품번|product\s*code|reference)\s*[:：]?\s*([A-Z0-9]{15})\b/gi)].map(m=>m[1].toUpperCase()))].filter(c=>byCode.has(c));
  if(codes.length!==1)continue;const code=codes[0],target=byCode.get(code);
  try{
   const alias=decodeURIComponent(new URL(target.url).pathname).match(/(?:-|\/)(\d{8,10})\.html$/)?.[1],matched=previous.filter(r=>r.sourceProductId===alias);
   const options=alias&&matched.length===1&&matched[0].normalizedCode===code?{expectedCode:code,expectedProductId:alias}:{};
   const row=parseBottegaProduct(html,target.url,cfg,options);
   row.checkedAt=fs.statSync(f).mtime.toISOString();
   row.proofFile=f;row.proofSha256=crypto.createHash('sha256').update(html).digest('hex');
   if(listed.has(code)&&!row.officialCategories.includes('Bags'))row.officialCategories.push('Bags');
   if((row.officialCategories.includes('NonBag')&&!row.officialCategories.includes('Bags'))||/키링|백\s*참|백\s*장식|스트랩|헤어|카드\s*홀더|선글라스|오 드 퍼퓸|향수|스니커|샌들|로퍼|벨트/.test(row.productName)){excluded.set(code,row);pending.delete(code);result.delete(code);continue;}
   if(!row.officialCategories.includes('Bags'))throw Error('BAG_CATEGORY_UNVERIFIED');
   if(!row.colorDisplay||!row.sourceImageUrl)throw Error('REFERENCE_DETAILS_INCOMPLETE');
   // Unconfirmed optional facts remain null; they do not hide an exact bag.
   row.sourceMetadataMissing=['materialDisplay','widthMm','heightMm','depthMm'].filter(k=>row[k]==null);
   Object.assign(row,bottegaModel(row.productName));result.set(code,row);pending.delete(code);excluded.delete(code);
  }catch(error){if(!result.has(code)&&!excluded.has(code))pending.set(code,{code,url:target.url,status:/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'PARSE_FAILED'});}
 }
}
for(const [code,p]of byCode)if(!result.has(code)&&!excluded.has(code)&&!pending.has(code))pending.set(code,{code,url:p.url,status:'NOT_YET_CHECKED'});
let retained=0;
for(const row of previous)if(!result.has(row.normalizedCode)){result.set(row.normalizedCode,row);retained++;}
const folder=path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata');fs.mkdirSync(folder,{recursive:true});
for(const[key,value]of [['validated-products',[...result.values()]],['bag-urls',[...result.values()].map(p=>p.officialUrl)],['excluded',[...excluded.values()]],['pending',[...pending.values()]]])fs.writeFileSync(path.join(folder,`${key}.json`),JSON.stringify(value),{mode:0o600});
const rows=[['CANDIDATES',source.length],['EXACT_BAGS',result.size],['OPTIONAL_FACTS_UNCONFIRMED',[...result.values()].filter(r=>r.sourceMetadataMissing.length).length],['OFFICIAL_NONBAGS',excluded.size],['PENDING',pending.size]].map(([k,n])=>({brand:'bottega-veneta',country:'KR',parentModel:'보존 응답 재검증',variantCode:'TOTAL',price:null,currency:'KRW',status:`${k}_${n}`,officialUrl:cfg.entryUrl}));
if(preserve)rows.push({brand:'bottega-veneta',country:'KR',parentModel:'기존 한국 기준 상품 유지',variantCode:'TOTAL',price:null,currency:'KRW',status:`RETAINED_PREVIOUS_REFERENCES_${retained}`,officialUrl:cfg.entryUrl});
const summary=path.join(folder,'summary.json');fs.writeFileSync(summary,JSON.stringify(rows));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status)throw Error('blocked');
const exceptions=path.join(folder,'summary-1.json');fs.writeFileSync(exceptions,JSON.stringify([...pending.values()].slice(0,25).map(p=>({brand:'bottega-veneta',country:'KR',parentModel:'공식 정보 추가 확인 대상',variantCode:p.code,price:null,currency:'KRW',status:p.status,officialUrl:p.url}))));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[exceptions],{stdio:'ignore'}).status)throw Error('blocked');
if(pending.size)process.exitCode=2;
