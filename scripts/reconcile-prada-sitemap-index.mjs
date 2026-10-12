import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {decodeHtml} from '../crawler/common/prada-product.js';
import {pradaCountrySitemapLinks} from '../crawler/common/prada-sitemap.js';
const root=path.resolve(import.meta.dirname,'..');
if(spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('preflight blocked');
const summary=[];
for(const country of ['fr','it','es','us','hk']){
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands/prada/countries',country))),folder=path.join(root,'crawler/runs/prada',country);
 if(!fs.existsSync(folder))continue;
 const dir=fs.readdirSync(folder).sort().reverse().map(name=>path.join(folder,name)).find(dir=>{const f=path.join(dir,'failure.json');return fs.existsSync(f)&&JSON.parse(fs.readFileSync(f)).failureCode==='SITEMAP_FORMAT_UNVERIFIED'&&Date.now()-fs.statSync(f).mtimeMs<86400000;});
 if(!dir)continue;
 const index=new Map();let sourceTime=0;
 for(const file of fs.readdirSync(path.join(dir,'raw')).filter(name=>/^sitemap-\d+\.xml$/.test(name))){
  const f=path.join(dir,'raw',file),stat=fs.statSync(f);if(stat.size>8*1024*1024||Date.now()-stat.mtimeMs>86400000)throw Error('source bounds');
  const mode=stat.mode&0o777;let xml;try{fs.chmodSync(f,0o600);xml=fs.readFileSync(f,'utf8');}finally{fs.chmodSync(f,mode);}
  if(!/<urlset\b/i.test(xml))continue;
  const locations=[...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)].map(m=>decodeHtml(m[1].trim()));
  for(const [code,url]of pradaCountrySitemapLinks(locations,cfg.listingUrls[0],country,cfg.referenceDetailPrefix))index.set(code,url);
  sourceTime=Math.max(sourceTime,stat.mtimeMs);
 }
 const state=path.join(root,'crawler/prada-progress',country);fs.mkdirSync(state,{recursive:true});
 if(index.size)fs.writeFileSync(path.join(state,'verified-sitemap-index.json'),JSON.stringify({sourceTime,entries:[...index]}),{mode:0o600});
 summary.push({brand:'prada',country:cfg.country,parentModel:'보존된 공식 XML 국가 URL 재검증',variantCode:'INDEX',price:null,currency:cfg.currency,status:`CACHED_EXACT_URLS_${index.size}`,officialUrl:cfg.listingUrls[0]});
}
const file=path.join(root,'crawler/completeness/prada/sitemap-reconciliation/summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(summary));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('summary blocked');
