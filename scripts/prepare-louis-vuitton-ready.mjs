import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {selectLouisVuittonAttribute} from '../crawler/common/louis-vuitton-metadata.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/completeness/louis-vuitton';
for(const folder of ['expanded-catalog-source','field-source'])if(spawnSync(root+'/scripts/crawl-output-guard.sh',[base+'/'+folder+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
const candidates=JSON.parse(fs.readFileSync(base+'/expanded-catalog-source/candidates.json')),fields=JSON.parse(fs.readFileSync(base+'/field-source/fields.json')),ready=[];let attributeConflicts=0;
for(const candidate of candidates){const all=fields.filter(f=>f.code===candidate.code),observations=all.filter(f=>f.currency==='KRW'&&f.price>0&&Number.isFinite(Date.parse(f.checkedAt))),latest=Math.max(...observations.map(f=>Date.parse(f.checkedAt))),prices=observations.filter(f=>Date.parse(f.checkedAt)===latest),values=[...new Set(prices.map(f=>f.price))];if(values.length!==1)continue;
 const record={...candidate,price:values[0],currency:'KRW',checkedAt:prices[0].checkedAt};
 // A disputed optional attribute must stay unknown; it must not discard the
 // independent, exact-SKU verified price, image and other attributes.
 for(const key of ['color','material','widthMm','heightMm','depthMm']){const selected=selectLouisVuittonAttribute(all,key);if(selected.conflict){attributeConflicts++;continue;}if(selected.value!==undefined)record[key]=selected.value;}
 ready.push(record);
}
// Discovery candidates are not proof of ingestion. Only a guarded public
// verification receipt may suppress a product from a later ingestion pass.
const oldCodes=new Set(),runBase=root+'/crawler/runs/louis-vuitton/kr';
for(const id of fs.readdirSync(runBase)){const file=runBase+'/'+id+'/artifacts/public-verified/summary.json';if(!fs.existsSync(file)||spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(fs.readFileSync(file)))if(r.status==='PUBLIC_CATALOG_VERIFIED')oldCodes.add(r.variantCode);}
const out=base+'/ready-catalog-source';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/candidates.json',JSON.stringify(ready.filter(r=>!oldCodes.has(r.code))),{mode:0o600});
const row=status=>({brand:'louis-vuitton',country:'KR',parentModel:'공식 동일 SKU 적재 준비',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp'});
const rows=[row('CANDIDATES_'+candidates.length),row('EXACT_BAG_PRICE_READY_'+ready.length),row('NEW_EXACT_BAGS_'+ready.filter(r=>!oldCodes.has(r.code)).length),row('UNKNOWN_CONFLICTING_ATTRIBUTES_'+attributeConflicts),...['color','material','widthMm'].map(k=>row('READY_'+k.toUpperCase()+'_'+ready.filter(r=>r[k]).length))];
fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
