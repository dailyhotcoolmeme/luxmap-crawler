import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {louisVuittonLinks,louisVuittonCode,decodeLouisVuitton,louisVuittonFamilyUrl} from '../crawler/common/louis-vuitton-product.js';
import {celineNodes} from '../crawler/common/celine-html.js';
import {cleanLouisVuittonName,louisVuittonBagListFamilies,louisVuittonExplicitBagImages} from '../crawler/common/louis-vuitton-metadata.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/runs/louis-vuitton/kr',cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/kr'));
const evidence=[];
for(const id of fs.readdirSync(base).sort()){
 const dir=base+'/'+id,file=dir+'/summary.json';if(!fs.existsSync(file)||spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;
 const rows=JSON.parse(fs.readFileSync(file));if(rows.some(r=>/UNAUTHORIZED|POLICY|LIMIT|GUARD/.test(r.status)))continue;evidence.push({dir,rows});
}
const imageSitemap='https://kr.louisvuitton.com/content/louisvuitton/sitemap/kor_KR/sitemap-image.xml';
const sitemap=evidence.filter(s=>s.rows.some(r=>r.status==='HTTP_200'&&r.officialUrl===imageSitemap)).at(-1)?.dir;
if(!sitemap)throw Error('IMAGE_SITEMAP_SOURCE_REQUIRED');
const listing=evidence.find(s=>s.rows.some(r=>/^LISTING_LINKS_\d+$/.test(r.status)&&r.officialUrl==='https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp')&&fs.existsSync(s.dir+'/raw/2.source'))?.dir;
function read(file){const mode=fs.statSync(file).mode&0o777;try{fs.chmodSync(file,0o600);return fs.readFileSync(file,'utf8');}finally{fs.chmodSync(file,mode);}}
const html=listing?read(listing+'/raw/2.source'):'',nodes=celineNodes(html),cardLinks=[];
for(const n of nodes){if(n.tag!=='a'||!n.attrs.href)continue;let p=n,card=false;while(p){if(/(?:^|\s)lv-product-card[\w-]*(?:\s|$)/.test(p.attrs.class??'')){card=true;break;}p=p.parent;}if(card)cardLinks.push(n.attrs.href);}
const published=cardLinks.length?cardLinks.map(u=>{try{return new URL(decodeLouisVuitton(u),cfg.entryUrl).href;}catch{return '';}}):[];
const families=new Set(published.filter(u=>u.startsWith('https://kr.louisvuitton.com/kor-kr/products/')).map(louisVuittonFamilyUrl));
const familySources=new Map([...families].map(f=>[f,{url:'https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp'}]));
// Extend the original bag-list proof only from successfully saved Korean bag
// lists. A primary product-list ancestor is required; recommendation/carousel
// cards are not category evidence for a new product family.
for(const id of fs.readdirSync(base)){
 const dir=base+'/'+id,f=dir+'/summary.json';if(!fs.existsSync(f)||spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)continue;
 const saved=JSON.parse(fs.readFileSync(f)).filter(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED');
 for(let i=0;i<saved.length;i++){
  const u=new URL(saved[i].officialUrl);if(u.origin!=='https://kr.louisvuitton.com'||!/^\/kor-kr\/(?:women\/handbags|men\/bags)\//.test(u.pathname)||/\/[^/]*accessories\//.test(u.pathname))continue;
  const file=dir+'/raw/'+(i+1)+'.source';if(!fs.existsSync(file))continue;
  for(const family of louisVuittonBagListFamilies(read(file),u.href)){families.add(family);if(!familySources.has(family))familySources.set(family,{url:u.href,run:dir,file:path.basename(file)});}
 }
}
const records=[],rows=[],seen=new Set();let total=0;
const expand=process.argv.includes('--expand-image-category');
const text=(body,tag)=>{const s=body.match(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i'))?.[1];return s?decodeLouisVuitton(s.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/,'$1').trim()):null;};
for(const file of fs.readdirSync(sitemap+'/raw').filter(f=>/^\d+\.source$/.test(f))){const xml=read(sitemap+'/raw/'+file);for(const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)){const block=match[1],url=text(block,'loc');if(!url)continue;let code;try{code=louisVuittonCode(url);}catch{continue;}if(!code)continue;total++;const family=louisVuittonFamilyUrl(url);
 const images=[];for(const im of block.matchAll(/<image:image\b[^>]*>([\s\S]*?)<\/image:image>/gi)){const image=text(im[1],'image:loc'),name=text(im[1],'image:title');if(image&&name)images.push({url:image,name});}
 const explicit=louisVuittonExplicitBagImages(images);
 if(!families.has(family)&&!(expand&&explicit)||!images.length||seen.has(code))continue;seen.add(code);const evidence=familySources.get(family);records.push({code,url,name:cleanLouisVuittonName(images[0].name),images,category:'bag',categorySource:evidence?.url??'https://kr.louisvuitton.com/content/louisvuitton/sitemap/kor_KR/sitemap-image.xml',categorySourceRun:evidence?.run,categorySourceFile:evidence?.file,categoryFamily:family,categoryEvidence:families.has(family)?'official_bag_list_card':'explicit_official_image_category',metadataComplete:false});
}}
const report=path.join(root,'crawler/completeness/louis-vuitton/'+(expand?'expanded-catalog-source':'catalog-source'));fs.mkdirSync(report,{recursive:true});fs.writeFileSync(report+'/candidates.json',JSON.stringify(records),{mode:0o600});
const row=(status,url=cfg.entryUrl,code='SOURCE')=>({brand:cfg.brand,country:'KR',parentModel:'공식 한국 가방 출처 대조',variantCode:code,price:null,currency:'KRW',status,officialUrl:url});
rows.push(...[`LISTED_BAG_FAMILIES_${families.size}`,`SITEMAP_REFERENCE_ROWS_${total}`,`BAG_NAME_IMAGE_MATCHES_${records.length}`].map(s=>row(s)));
for(const r of records.slice(0,3)){rows.push(row('BAG_SOURCE_PRICE_UNVERIFIED',r.url,r.code));rows.push(row('PUBLISHED_EXACT_IMAGE',r.images[0].url,r.code));}
fs.writeFileSync(report+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[report+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
