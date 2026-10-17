import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {celineNodes,celineText} from '../crawler/common/celine-html.js';
import {louisVuittonCode,isLouisVuittonReference} from '../crawler/common/louis-vuitton-product.js';
const root=path.resolve(import.meta.dirname,'..'),run=root+'/crawler/runs/louis-vuitton/kr/20261013T063602Z-43798',out=root+'/crawler/completeness/louis-vuitton/card-fields';
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[run+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
const files=new Set([run+'/raw/2.source']),base=root+'/crawler/runs/louis-vuitton/kr';
for(const id of fs.readdirSync(base)){
 const summary=base+'/'+id+'/summary.json';if(!fs.existsSync(summary)||spawnSync(root+'/scripts/crawl-output-guard.sh',[summary],{stdio:'ignore'}).status)continue;
 const rows=JSON.parse(fs.readFileSync(summary));if(rows.some(r=>/UNAUTHORIZED|POLICY|LIMIT|GUARD/.test(r.status)))continue;
 let index=0;for(const row of rows)if(row.status==='NORMAL_RENDERED_DOCUMENT_SAVED')files.add(base+'/'+id+'/raw/'+(++index)+'.source');
}
const records=[];let exact=0;
for(const f of files){
if(!fs.existsSync(f))continue;const stat=fs.statSync(f);if(stat.size>8388608)throw Error('SOURCE_LIMIT');const mode=stat.mode&0o777;let html;try{fs.chmodSync(f,0o600);html=fs.readFileSync(f,'utf8');}finally{fs.chmodSync(f,mode);}
const nodes=celineNodes(html),cards=nodes.filter(n=>/(?:^|\s)lv-product-card[\w-]*(?:\s|$)/.test(n.attrs.class??''));
for(const card of cards){const within=n=>{let p=n;while(p){if(p===card)return true;p=p.parent;}return false;},children=nodes.filter(within),codes=new Set();
 for(const n of children)for(const [key,v] of Object.entries(n.attrs)){if(/^(?:data-sku|data-product-id|data-product-sku)$/.test(key)&&isLouisVuittonReference(v))codes.add(v);if(key==='href')try{const code=louisVuittonCode(new URL(v,'https://kr.louisvuitton.com/kor-kr/'));if(code)codes.add(code);}catch{}if(/^(?:src|data-src)$/.test(key)){const code=v.match(/--([A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})_/i)?.[1];if(code)codes.add(code);}}
 if(codes.size!==1)continue;exact++;const record={code:[...codes][0]},colors=new Set(),materials=new Set();
 for(const n of children){for(const k of ['data-color','data-color-name','data-selected-color'])if(n.attrs[k]&&n.attrs[k].length<100)colors.add(n.attrs[k]);for(const k of ['data-material','data-material-name'])if(n.attrs[k]&&n.attrs[k].length<200)materials.add(n.attrs[k]);const label=n.attrs['aria-label']??'',color=label.match(/^(?:색상|컬러|colou?r)\s*[:：]\s*(.{1,100})$/i)?.[1];if(color&&n.attrs['aria-checked']==='true')colors.add(color);if(/(?:^|\s)(?:lv-product-card[\w-]*__)?color-name(?:\s|$)/.test(n.attrs.class??'')){const t=celineText(n);if(t.length<100)colors.add(t);}}
 if(colors.size===1)record.color=[...colors][0];if(materials.size===1)record.material=[...materials][0];if(record.color||record.material)records.push({...record,sourceCountry:'KR',sourceCheckedAt:stat.mtime.toISOString()});
}
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/fields.json',JSON.stringify(records),{mode:0o600});const rows=[`EXACT_SKU_CARD_NODES_${exact}`,`COLOR_FIELDS_${records.filter(r=>r.color).length}`,`MATERIAL_FIELDS_${records.filter(r=>r.material).length}`].map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'공식 상품 카드의 명시 속성',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp'}));fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
