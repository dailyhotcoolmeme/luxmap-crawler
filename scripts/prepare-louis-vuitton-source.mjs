import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {louisVuittonLinks,louisVuittonCode,louisVuittonAccess,louisVuittonJson} from '../crawler/common/louis-vuitton-product.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/runs/louis-vuitton/kr',source=path.resolve(process.argv[2]??'');
if(path.dirname(source)!==base)throw Error('SOURCE_SCOPE');
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[source+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
const prior=JSON.parse(fs.readFileSync(source+'/summary.json'));if(!prior.some(r=>r.status.startsWith('CATEGORY_LINKS_'))||prior.some(r=>r.status==='ACCESS_BLOCKED'))throw Error('NORMAL_SOURCE_REQUIRED');
const cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/kr')),urls=new Set(),all=new Set();let pages=0,products=0,pricedCards=0;const cardEvidence=[];
for(const file of fs.readdirSync(source+'/raw').filter(f=>/^\d+\.source$/.test(f))){const target=source+'/raw/'+file,mode=fs.statSync(target).mode&0o777;let bytes;try{fs.chmodSync(target,0o600);bytes=fs.readFileSync(target);}finally{fs.chmodSync(target,mode);}if(bytes.length>cfg.maxResponseBytes)throw Error('SOURCE_LIMIT');const html=bytes.toString();louisVuittonAccess(html);pages++;for(const url of louisVuittonLinks(html,cfg.entryUrl,cfg)){all.add(url);if(louisVuittonCode(url))urls.add(url);}products+=louisVuittonJson(html).filter(p=>[p['@type']].flat().includes('Product')).length;
 for(const m of html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/gi)){const card=m[0],links=louisVuittonLinks(card,cfg.entryUrl,cfg).filter(louisVuittonCode),codes=new Set(links.map(louisVuittonCode)),prices=new Set([...card.replace(/<[^>]*>/g,' ').matchAll(/₩\s*([\d,]+)/g)].map(m=>Number(m[1].replaceAll(',',''))).filter(n=>n>0));if(codes.size!==1||prices.size!==1)continue;pricedCards++;cardEvidence.push({sourceFile:file,code:[...codes][0],price:[...prices][0],url:links[0],html:card});}
}
const out=source+'/artifacts';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/discovery-candidates.json',JSON.stringify([...urls]),{mode:0o600});
fs.writeFileSync(out+'/listing-card-evidence.json',JSON.stringify(cardEvidence),{mode:0o600});
if(process.argv[3]==='--sitemap-run'){
 const sitemap=path.resolve(process.argv[4]??'');if(path.dirname(sitemap)!==base||spawnSync(root+'/scripts/crawl-output-guard.sh',[sitemap+'/summary.json'],{stdio:'ignore'}).status)throw Error('SITEMAP_SOURCE_GUARD');
 const mapRows=JSON.parse(fs.readFileSync(sitemap+'/summary.json'));if(!mapRows.some(r=>r.status==='DISCOVERY_ONLY_NOT_INGESTED'))throw Error('SITEMAP_NOT_COMPLETE');
 const current=new Set(JSON.parse(fs.readFileSync(sitemap+'/artifacts/discovery-candidates.json'))),blocked=new Set();
 for(const folder of fs.readdirSync(base)){const f=base+'/'+folder+'/summary.json';if(!fs.existsSync(f)||spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(fs.readFileSync(f)))if(r.status.includes('ACCESS_BLOCKED'))blocked.add(r.officialUrl);}
 const pool=[...urls].filter(u=>current.has(u)&&!blocked.has(u));
 // A published product URL is a request candidate, not handbag proof. The
 // product parser must still independently validate its exact category/SKU.
 const sample=(pool.length?pool:[...current].filter(u=>!blocked.has(u)&&/\/products\/(?:neverfull|speedy|tote|handbag)[-/]/i.test(u))).slice(0,1);
 if(!sample.length)throw Error('NO_UNBLOCKED_SAMPLE');
 const sampleDir=source+'/single-current/artifacts';fs.mkdirSync(sampleDir,{recursive:true});fs.writeFileSync(sampleDir+'/discovery-candidates.json',JSON.stringify(sample),{mode:0o600});
}
const report=out+'/recovered-source';fs.mkdirSync(report,{recursive:true});const rows=[`NORMAL_PAGES_${pages}`,`OFFICIAL_LINKS_${all.size}`,`CANDIDATES_${urls.size}`,`JSONLD_PRODUCTS_${products}`,`SINGLE_SKU_PRICED_CARDS_${pricedCards}`].map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'정상 공식 출처 재사용',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:cfg.entryUrl}));fs.writeFileSync(report+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[report+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
