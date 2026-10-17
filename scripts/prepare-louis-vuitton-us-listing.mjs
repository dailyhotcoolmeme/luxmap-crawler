import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {louisVuittonLinks} from '../crawler/common/louis-vuitton-product.js';
const root=path.resolve(import.meta.dirname,'..'),source=root+'/crawler/runs/louis-vuitton/us/20261016T035847Z-38539',out=root+'/crawler/completeness/louis-vuitton/us-listing-source',cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/us'));
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[source+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');const rows=JSON.parse(fs.readFileSync(source+'/summary.json')),url=rows.find(r=>r.status==='EXACT_SKU_URL')?.officialUrl;if(!url)throw Error('EXACT_SOURCE_REQUIRED');
const file=source+'/raw/1.source',mode=fs.statSync(file).mode&0o777;let text;try{fs.chmodSync(file,0o600);text=fs.readFileSync(file,'utf8');}finally{fs.chmodSync(file,mode);}
const links=louisVuittonLinks(text,url,cfg).filter(u=>new URL(u).pathname.startsWith('/eng-us/women/handbags/')).sort((a,b)=>a.length-b.length);
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/links.json',JSON.stringify(links),{mode:0o600});fs.writeFileSync(out+'/summary.json',JSON.stringify(links.slice(0,4).map(officialUrl=>({brand:'louis-vuitton',country:'US',parentModel:'정상 상품 상세가 게시한 가방 목록',variantCode:'SOURCE',price:null,currency:'USD',status:'PUBLISHED_US_BAG_LIST',officialUrl}))),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
