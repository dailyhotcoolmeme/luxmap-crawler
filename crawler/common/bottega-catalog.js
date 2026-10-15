import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';
import {listingTiles} from './official-listing-tiles.js';
import {parseBottegaProduct} from './bottega-product.js';
import {bottegaModel} from './bottega-model.js';
import {resolveBottegaListingReference} from './bottega-listing-reference.js';
import crypto from 'node:crypto';
import {downloadAndOptimizeImage,closeImageProcessor} from './image-processor.js';
import {recordAvailability} from './catalog-availability.js';

export async function collectBottega(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
 if(args.some(v=>v.startsWith('--')&&!['--country-config','--discover-catalog','--discovery-state-file','--urls-file','--cached-records-file','--metadata-only'].includes(v)))throw Error('INVALID_MODE');
 const cfg=JSON.parse(await fs.readFile(arg('--country-config')));
 if(cfg.country!=='KR')throw Error('REFERENCE_ONLY');
 const run=process.env.CRAWL_RUN_DIR,artifact=path.join(run,'artifacts');await fs.mkdir(artifact,{recursive:true});
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});
 const summaries=[],records=[],discovered=new Map();let calls=0;
 const summarize=(status,row={})=>({brand:cfg.brand,country:cfg.country,parentModel:(row.productName??'한국 공식 가방 목록').slice(0,120),variantCode:row.normalizedCode??'CATALOG',price:row.price??null,currency:cfg.currency,status,officialUrl:row.officialUrl??cfg.entryUrl});
 async function save(){for(let i=0;i<Math.max(1,summaries.length);i+=25)await fs.writeFile(path.join(run,i?`summary-${i/25}.json`:'summary.json'),JSON.stringify(summaries.slice(i,i+25)));}
 const approved=url=>{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!cfg.allowedHosts.includes(u.hostname)||u.hostname==='bottega-veneta.dam.kering.com')throw Error('UNAUTHORIZED_URL');return u;};
 async function get(url){
  let target=approved(url).href;
  for(let i=0;i<4;i++){
   if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');
   const r=await context.get(target,{maxRedirects:0});
   if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');
   if([301,302,303,307,308].includes(r.status())){target=approved(new URL(r.headers().location,target)).href;continue;}
   if(!r.ok()){recordAvailability(run,cfg,target,r.status());throw Error(`HTTP_${r.status()}`);}
   const body=await r.body();if(body.length>8*1024*1024)throw Error('RESPONSE_LIMIT');
   await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});
   const text=body.toString('utf8');if(/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human/i.test(text))throw Error('ACCESS_BLOCKED');
   return{text,url:target};
  }throw Error('REDIRECT_LIMIT');
 }
 try{
  if(args.includes('--discover-catalog')){
   const queue=[],seen=new Set(),unresolved=new Map();let batchPages=0;
   let references=[];try{references=JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'../../crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json')));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(args.includes('--discovery-state-file')){
    const state=JSON.parse(await fs.readFile(arg('--discovery-state-file')));
    if(state.brand!==cfg.brand||state.country!==cfg.country||Date.now()-Date.parse(state.checkedAt)>86400000||!Array.isArray(state.pending)||!Array.isArray(state.products)||!Array.isArray(state.seen))throw Error('INVALID_DISCOVERY_STATE');
    for(const u of state.seen)seen.add(approved(u).href);
    for(const u of state.pending)queue.push(approved(u).href);
    for(const p of state.unresolved??[])unresolved.set(p.url,p);
    for(const p of state.products){approved(p.url);if(!/^[A-Z0-9]{15}$/i.test(p.sku)||p.currency!==cfg.currency||!(p.price>0))throw Error('INVALID_DISCOVERY_STATE');discovered.set(p.sku.toUpperCase(),p);}
   }else queue.push(...cfg.probeListingUrls);
   const saveDiscovery=()=>fs.writeFile(path.join(artifact,'catalog-discovery-state.json'),JSON.stringify({brand:cfg.brand,country:cfg.country,checkedAt:new Date().toISOString(),seen:[...seen],pending:queue,products:[...discovered.values()],unresolved:[...unresolved.values()]}),{mode:0o600});
   // Only category and pagination links actually published by the official site.
   const enqueue=(html,base)=>{for(const m of html.matchAll(/(?:href|data-url|data-href)=["']([^"']+)["']/gi))try{
    const u=approved(new URL(decodeHtml(m[1]),base));u.hash='';
    const decoded=decodeURIComponent(u.pathname);
    const category=u.pathname.startsWith(cfg.localePrefix)&&(/\/핸드백-여성(?:\/|$)/.test(decoded)||/\/남성-컬렉션\/백(?:\/|$)/.test(decoded))&&!/[A-Z0-9]{15}\.html$/i.test(decoded);
    const pagination=/\/(?:Search-UpdateGrid|Search-Show)$/.test(u.pathname)&&/handbag|bags/i.test(u.searchParams.get('cgid')??'');
    if((category||pagination)&&!seen.has(u.href)&&!queue.includes(u.href))queue.push(u.href);
   }catch{}};
   if(!args.includes('--discovery-state-file')){const home=await get(cfg.entryUrl);enqueue(home.text,home.url);}
   while(queue.length){
    if(batchPages>=cfg.maxDiscoveryPages){await saveDiscovery();throw Error('DISCOVERY_BATCH_PENDING');}
    const url=queue[0];if(seen.has(url)){queue.shift();continue;}
    batchPages++;
    const page=await get(url),tiles=listingTiles(page.text,page.url,cfg);
    for(const tile of tiles){const code=resolveBottegaListingReference(tile,references);if(!code){unresolved.set(tile.url,tile);continue;}const old=discovered.get(code);if(old&&old.price!==tile.price)throw Error('LISTING_PRICE_CONFLICT');discovered.set(code,{...tile,sku:code});}
    queue.shift();seen.add(url);
    enqueue(page.text,page.url);
    summaries.splice(0,summaries.length,summarize(`LISTING_PAGES_${seen.size}`),summarize(`DISCOVERED_${discovered.size}`),summarize(`PENDING_PAGES_${queue.length}`));await saveDiscovery();await save();
   }
   if(!discovered.size)throw Error('EMPTY_CATALOG');
   await fs.writeFile(path.join(artifact,'catalog-source-products.json'),JSON.stringify([...discovered.values()]),{mode:0o600});
   await fs.writeFile(path.join(artifact,'catalog-urls.json'),JSON.stringify([...discovered.values()].map(t=>t.url)),{mode:0o600});
   await fs.writeFile(path.join(artifact,'unresolved-listing-references.json'),JSON.stringify([...unresolved.values()]),{mode:0o600});
   await fs.writeFile(path.join(artifact,'listing-coverage.json'),JSON.stringify({checkedAt:new Date().toISOString(),pages:[...seen],pendingPages:queue,discovered:discovered.size,scope:'published-women-handbag-categories'}),{mode:0o600});
   summaries.push(summarize('PUBLISHED_LISTING_TRAVERSAL_COMPLETE'));
   if(unresolved.size){summaries.push(summarize(`UNRESOLVED_LISTING_REFERENCES_${unresolved.size}`));process.exitCode=1;}
  }else{
   if(!args.includes('--urls-file')&&!args.includes('--cached-records-file'))throw Error('URL_BATCH_REQUIRED');
   const cached=args.includes('--cached-records-file')?JSON.parse(await fs.readFile(arg('--cached-records-file'))):null;
   const urls=cached?cached.map(r=>r.officialUrl):JSON.parse(await fs.readFile(arg('--urls-file')));
   if(!Array.isArray(urls)||!urls.length||urls.length>cfg.maxProductsPerRun||new Set(urls).size!==urls.length)throw Error('PRODUCT_LIMIT');
   const base=path.dirname(run),dirs=(await fs.readdir(base)).sort().reverse();let source,listed=new Set();
   for(const name of dirs){const file=path.join(base,name,'artifacts/catalog-source-products.json');try{source=JSON.parse(await fs.readFile(file));try{listed=new Set(JSON.parse(await fs.readFile(path.join(base,name,'artifacts/catalog-listed-source-products.json'))).map(p=>p.sku.toUpperCase()));}catch(error){if(error.code!=='ENOENT')throw error;}break;}catch(error){if(error.code!=='ENOENT')throw error;}}
   let retained=[];try{retained=JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'../../crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json')));}catch(error){if(error.code!=='ENOENT')throw error;}
   source=[...(source??[]),...retained.map(r=>({sku:r.normalizedCode,url:r.officialUrl}))];
   if(!source.length||!urls.every(url=>source.some(p=>p.url===url)))throw Error('PUBLISHED_BAG_LISTING_REQUIRED');
   for(const url of urls){
    try{
    let page,proof;
    if(cached){
     proof=cached.find(r=>r.officialUrl===url);const file=path.resolve(proof.proofFile),proofRoot=path.dirname(run);
     if(!file.startsWith(proofRoot+path.sep)||!/^\d+\.source$/.test(path.basename(file))||path.basename(path.dirname(file))!=='raw'||await fs.realpath(file)!==file)throw Error('INVALID_METADATA_PROOF');
     const stat=await fs.stat(file),mode=stat.mode&0o777;let text;try{await fs.chmod(file,0o600);text=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,mode);}
     if(Date.now()-stat.mtimeMs>86400000||crypto.createHash('sha256').update(text).digest('hex')!==proof.proofSha256)throw Error('STALE_OR_CHANGED_METADATA_PROOF');
     page={text,url};
    }else page=await get(url);
    let options={};
    const alias=decodeURIComponent(new URL(url).pathname).match(/(?:-|\/)(\d{8,10})\.html$/)?.[1];
    if(alias){
     const known=proof?[proof]:JSON.parse(await fs.readFile(path.resolve(import.meta.dirname,'../../crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json'))),matches=known.filter(r=>r.sourceProductId===alias),expected=source.find(p=>p.url===url)?.sku.toUpperCase();
     if(matches.length!==1||matches[0].normalizedCode!==expected)throw Error('EXACT_REFERENCE_REQUIRED');
     options={expectedCode:expected,expectedProductId:alias};
    }
    const row=parseBottegaProduct(page.text,url,cfg,options);
    if(!proof)recordAvailability(run,cfg,url,200,true);
    if(proof){if(row.normalizedCode!==proof.normalizedCode||row.price!==proof.price||row.currency!==proof.currency)throw Error('METADATA_PROOF_MISMATCH');row.checkedAt=(await fs.stat(proof.proofFile)).mtime.toISOString();}
    if(/키링|백\s*참|백\s*장식|스트랩|헤어|카드\s*홀더/.test(row.productName)){
     summaries.push(summarize('OFFICIAL_ACCESSORY_EXCLUDED',row));await save();continue;
    }
    if(!row.officialCategories.includes('Bags')&&!listed.has(row.normalizedCode))throw Error('BAG_CATEGORY_UNVERIFIED');
    // Fail closed on incomplete options; never create an artificial colour or size.
    if(!row.colorDisplay||!row.sourceImageUrl){
     await fs.writeFile(path.join(artifact,`${row.normalizedCode}-incomplete-fields.json`),JSON.stringify(row),{mode:0o600});
     throw Error('REFERENCE_DETAILS_INCOMPLETE');
    }
    Object.assign(row,bottegaModel(row.productName));
    if(!args.includes('--metadata-only'))Object.assign(row,await downloadAndOptimizeImage({request:context},row.sourceImageUrl,artifact));
    records.push(row);summaries.push(summarize(args.includes('--metadata-only')?'EXACT_METADATA_CONFIRMED':'confirmed',row));
    await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await save();
    }catch(error){
     if(['ACCESS_BLOCKED','UNAUTHORIZED_URL','REQUEST_LIMIT','RESPONSE_LIMIT','REDIRECT_LIMIT'].includes(error.message))throw error;
     const status=/^[A-Z][A-Z0-9_]{0,39}$/.test(error.message)?error.message:'DETAIL_REQUEST_FAILED';
     const code=decodeURIComponent(new URL(url).pathname).match(/([A-Z0-9]{15})\.html$/i)?.[1]?.toUpperCase()??'UNKNOWN';
     summaries.push(summarize(status,{normalizedCode:code,officialUrl:url}));process.exitCode=1;await save();
     await fs.writeFile(path.join(artifact,`${code}-private-failure.json`),JSON.stringify({code,status,message:String(error.message??'').slice(0,300)}),{mode:0o600});
    }
   }
  }
 }catch(error){const code=/^[A-Z][A-Z0-9_]{0,70}$/.test(error.message)?error.message:'SOURCE_REQUEST_FAILED';summaries.push(summarize(code));await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:code}));process.exitCode=1;
 }finally{await save();await closeImageProcessor();await context.dispose();}
}
