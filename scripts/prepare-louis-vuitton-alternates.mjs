import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {louisVuittonCode,decodeLouisVuitton} from '../crawler/common/louis-vuitton-product.js';
import {louisVuittonPublicDataLinks} from '../crawler/common/louis-vuitton-public-links.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/runs/louis-vuitton/kr',out=root+'/crawler/completeness/louis-vuitton/published-alternates',records=[],seen=new Set();
const allowedHosts=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/kr')).allowedHosts;
const allowed=new Set(['KR','JP','FR','IT','ES','US','SG','HK']),lists=new Set(),attempted=new Set();
const publicData=new Map();
for(const id of fs.readdirSync(base)){const f=base+'/'+id+'/summary.json';if(!fs.existsSync(f)||spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(fs.readFileSync(f)))if(r.officialUrl&&/NORMAL_RENDERED_DOCUMENT_SAVED|ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status))attempted.add(r.officialUrl);}
for(const id of fs.readdirSync(base)){const dir=base+'/'+id,file=dir+'/summary.json';if(!fs.existsSync(file)||spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;const evidence=JSON.parse(fs.readFileSync(file)),rows=evidence.filter(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED');
 if(!rows.length&&['20261013T063602Z-43798','20261016T021902Z-74476'].includes(id)&&evidence.some(r=>/^CATEGORY_LINKS_|^LISTING_LINKS_/.test(r.status))){
  const metadata=dir+'/artifacts/native-metadata';let objects=[];if(fs.existsSync(metadata+'/summary.json')){if(spawnSync(root+'/scripts/crawl-output-guard.sh',[metadata+'/summary.json'],{stdio:'ignore'}).status)throw Error('METADATA_SOURCE_GUARD');objects=JSON.parse(fs.readFileSync(metadata+'/objects.json'));}
  for(const name of fs.readdirSync(dir+'/raw').filter(n=>/^\d+\.source$/.test(n))){const raw=dir+'/raw/'+name,stat=fs.statSync(raw);if(stat.size>8388608)throw Error('SOURCE_LIMIT');let html;try{fs.chmodSync(raw,0o600);html=fs.readFileSync(raw,'utf8');}finally{fs.chmodSync(raw,stat.mode&0o777);}for(const link of louisVuittonPublicDataLinks(html,objects,'https://kr.louisvuitton.com/kor-kr/homepage',allowedHosts))if(!attempted.has(link.url))publicData.set(link.url,link);}
 }
 if(evidence.some(r=>r.status==='DISCOVERY_ONLY_NOT_INGESTED')&&evidence.some(r=>r.status==='HTTP_200'&&/^https:\/\/kr\.louisvuitton\.com\/content\/louisvuitton\/sitemap\/kor_KR\//.test(r.officialUrl))){
  for(const name of fs.readdirSync(dir+'/raw').filter(n=>/^\d+\.source$/.test(n))){const raw=dir+'/raw/'+name,stat=fs.statSync(raw);if(stat.size>8388608)throw Error('SOURCE_LIMIT');let xml;try{fs.chmodSync(raw,0o600);xml=fs.readFileSync(raw,'utf8');}finally{fs.chmodSync(raw,stat.mode&0o777);}
   for(const match of xml.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi))try{const u=new URL(decodeLouisVuitton(match[1]));if(u.origin==='https://kr.louisvuitton.com'&&!u.search&&!u.hash&&!attempted.has(u.href)&&/^\/kor-kr\/(?:women\/handbags|men\/bags)\//.test(u.pathname)&&!u.pathname.includes('accessories'))publicData.set(u.href,{url:u.href,kind:'EXPLICIT_KR_BAG_CATEGORY',sourceUrl:evidence.find(r=>r.status==='DISCOVERY_ONLY_NOT_INGESTED').officialUrl});}catch{}
  }
 }
 if(!rows.length)continue;
 for(let i=0;i<rows.length;i++){const source=rows[i],code=louisVuittonCode(source.officialUrl);const file=dir+'/raw/'+(i+1)+'.source';if(!fs.existsSync(file))continue;const mode=fs.statSync(file).mode&0o777;let text;try{fs.chmodSync(file,0o600);text=fs.readFileSync(file,'utf8');}finally{fs.chmodSync(file,mode);}
  let objects=[];const metadata=dir+'/artifacts/native-metadata';if(fs.existsSync(metadata+'/summary.json')){if(spawnSync(root+'/scripts/crawl-output-guard.sh',[metadata+'/summary.json'],{stdio:'ignore'}).status)throw Error('METADATA_SOURCE_GUARD');objects=JSON.parse(fs.readFileSync(metadata+'/objects.json'));}
  for(const link of louisVuittonPublicDataLinks(text,objects,source.officialUrl,allowedHosts)) if(!attempted.has(link.url))publicData.set(link.url,link);
  for(const m of text.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi))try{const u=new URL(decodeLouisVuitton(m[1]),source.officialUrl);if(u.origin==='https://kr.louisvuitton.com'&&!u.search&&!u.hash&&!attempted.has(u.href)){if(/^\/kor-kr\/women\/handbags\//.test(u.pathname))lists.add(u.href);if(/^\/kor-kr\/men\/bags\//.test(u.pathname)&&!u.pathname.includes('accessories'))publicData.set(u.href,{url:u.href,kind:'EXPLICIT_KR_BAG_CATEGORY',sourceUrl:source.officialUrl});}}catch{}
  if(!code)continue;
  for(const match of text.matchAll(/<link\b[^>]*>/gi)){const attrs=Object.fromEntries([...match[0].matchAll(/\b(rel|href|hreflang)\s*=\s*["']([^"']*)["']/gi)].map(m=>[m[1].toLowerCase(),decodeLouisVuitton(m[2])]));if(!/\balternate\b/i.test(attrs.rel??''))continue;const country=attrs.hreflang?.split('-').at(-1)?.toUpperCase();if(!allowed.has(country))continue;try{const url=new URL(attrs.href,source.officialUrl);if(url.protocol!=='https:'||!url.hostname.endsWith('.louisvuitton.com')||url.username||url.password||louisVuittonCode(url.href)!==code)continue;const key=code+'|'+country;if(seen.has(key))continue;seen.add(key);records.push({code,country,url:url.href,sourceUrl:source.officialUrl});}catch{}}
 }
}
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/links.json',JSON.stringify(records),{mode:0o600});const rows=[];for(const country of allowed){const subset=records.filter(r=>r.country===country),sample=subset[0];if(sample)rows.push({brand:'louis-vuitton',country,parentModel:'한국 상세가 게시한 동일 SKU 국가 연결',variantCode:sample.code,price:null,currency:country==='KR'?'KRW':country==='US'?'USD':country==='JP'?'JPY':['FR','IT','ES'].includes(country)?'EUR':country==='HK'?'HKD':'SGD',status:'PUBLISHED_ALTERNATE_SKUS_'+subset.length,officialUrl:sample.url});}
const pendingLists=[...lists].filter(url=>!new URL(url).pathname.includes('/bag-accessories/')).sort((a,b)=>Number(/\/_\/N-tfr7qdp-bl/.test(b))-Number(/\/_\/N-tfr7qdp-bl/.test(a)));
fs.writeFileSync(out+'/unvisited-lists.json',JSON.stringify(pendingLists),{mode:0o600});for(const url of pendingLists)rows.push({brand:'louis-vuitton',country:'KR',parentModel:'정상 한국 상세에 게시된 미방문 가방 목록',variantCode:'SOURCE',price:null,currency:'KRW',status:'UNVISITED_PUBLISHED_BAG_LIST',officialUrl:url});
fs.writeFileSync(out+'/public-data-links.json',JSON.stringify([...publicData.values()]),{mode:0o600});
rows.push({brand:'louis-vuitton',country:'KR',parentModel:'정상 공식 문서 명시 공개 데이터 경로',variantCode:'SOURCE',price:null,currency:'KRW',status:'PUBLIC_DATA_LINKS_'+publicData.size,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'});
for(const link of publicData.values())rows.push({brand:'louis-vuitton',country:'KR',parentModel:'정상 공식 문서 명시 공개 데이터 경로',variantCode:'SOURCE',price:null,currency:'KRW',status:link.kind,officialUrl:link.url});
fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
