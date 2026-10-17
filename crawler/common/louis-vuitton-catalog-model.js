import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {request} from 'playwright-core';
import {isLouisVuittonReference,louisVuittonAccess,louisVuittonCode} from './louis-vuitton-product.js';
import {originalImageUrl} from './image-processor.js';
import {readRegisteredLouisVuitton} from './louis-vuitton-registered.js';
import {louisVuittonAccessStops} from './louis-vuitton-access-stops.js';
export function catalogOriginalImage(value,code){
 const u=new URL(value);
 // The official API publishes unresolved display-size placeholders. Remove
 // only this exact template, retaining the published asset and view verbatim.
 const params=[...u.searchParams];
 if(params.length===2&&u.searchParams.get('wid')==='{IMG_WIDTH}'&&u.searchParams.get('hei')==='{IMG_HEIGHT}'){
  const original=new URL(u);original.search='';
  return originalImageUrl(original.href,code);
 }
 return u.href;
}
// LV's documented SKU -> product -> model route; not a foreign vendor URL.
// Provenance: andy922200/louis-vuitton-crawler main.py ae702396 (2025-03-26).
export function catalogModelUrl(kind,id){
 if(kind==='sku'&&!isLouisVuittonReference(id)||kind==='product'&&!/^[A-Za-z0-9_-]{1,80}$/.test(id)||!['sku','product'].includes(kind))throw Error('CATALOG_IDENTITY');
 return 'https://api.louisvuitton.com/api/kor-kr/catalog/'+kind+'/'+id+(kind==='sku'?'/persodetails':'');
}
export const catalogFamilyId=url=>new URL(url).pathname.match(/-(nvprod\d+v|P\d+)\/[A-Z0-9]+\/?$/i)?.[1]??null;
export function catalogModelImages(objects,target,cfg){
 const images=new Map();
 for(let p of objects){
  if(p?.identifier===target.code&&p.offers?.priceSpecification){try{p=catalogModelProduct({name:target.name,model:[p]},target);}catch{continue;}}
  if(p?.['@type']!=='Product'||p.sku!==target.code||p.url!==target.url||p.offers?.priceCurrency!=='KRW'||!(Number(p.offers.price)>0))continue;
  for(const im of [p.image].flat().filter(Boolean))try{const u=new URL(typeof im==='string'?im:im.contentUrl??im.url);if(u.protocol!=='https:'||u.username||u.password||u.hash||!cfg.imageHosts.includes(u.hostname)||u.href.length>500)continue;const original=catalogOriginalImage(u.href,target.code);images.set(original,{url:original,name:typeof im.name==='string'?im.name:p.name});}catch{}
 }
 return [...images.values()];
}
// Prada-style linked variants: require a real known bag as positive control
// for the very same published model URL + explicit variant identifier pattern.
export function catalogLinkedModels(data,known,cfg){
 const models=Array.isArray(data?.model)?data.model:[],codes=new Set(known.map(c=>c.code)),out=[];
 for(const model of models){
  if(!isLouisVuittonReference(model?.identifier)||codes.has(model.identifier)||models.filter(m=>m.identifier===model.identifier).length!==1)continue;
  let url,family;try{const u=new URL(model.url,cfg.entryUrl);if(u.origin!=='https://kr.louisvuitton.com'||u.search||u.hash||u.username||u.password||!u.pathname.startsWith('/kor-kr/products/'))continue;url=u.href.replace(/\/$/,'');if(!url.endsWith('/'+model.identifier))url+='/'+model.identifier;family=url.slice(0,-model.identifier.length-1);}catch{continue;}
  const anchor=known.find(c=>c.category==='bag'&&c.categoryEvidence!=='official_api_model_variant'&&c.categoryFamily===family&&models.some(m=>m.identifier===c.code&&c.url===family+'/'+c.code));
  if(!anchor)continue;
  let product;try{product=catalogModelProduct(data,{code:model.identifier,url});}catch{continue;}
  const images=catalogModelImages([product],{code:model.identifier,url},cfg);if(!images.length)continue;
  out.push({...anchor,code:model.identifier,url,name:product.name,images,categoryFamily:family,categoryEvidence:'official_api_model_variant',categoryAnchorCode:anchor.code,categoryImages:anchor.categoryImages??anchor.images,metadataComplete:false});
 }
 return out;
}
export async function verifyCatalogLinkedSource(source,anchor,root,cfg){
 if(!anchor||anchor.categoryEvidence==='official_api_model_variant'||anchor.categoryFamily!==source.categoryFamily)return false;
 const dir=source.categoryModelSourceRun,base=root+'/crawler/runs/louis-vuitton/kr';
 if(typeof dir!=='string'||path.dirname(dir)!==base||!/^\d{8}T\d{6}Z-\d+$/.test(path.basename(dir))||spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('MODEL_CATEGORY_SOURCE_GUARD');
 const rows=JSON.parse(await fs.readFile(dir+'/summary.json'));let index=0,file;
 for(const r of rows.filter(r=>r.parentModel==='LV 공식 SKU 상품 모델 연결'&&/^CATALOG_HTTP_\d+$/.test(r.status))){index++;if(r.status==='CATALOG_HTTP_200'&&r.officialUrl===source.categorySource&&/^https:\/\/api\.louisvuitton\.com\/api\/kor-kr\/catalog\/product\/[A-Za-z0-9_-]+$/.test(r.officialUrl))file=(path.basename(dir)==='20261016T233606Z-69293'?'':'api-')+index+'.source';}
 if(!file||file!==source.categoryModelSourceFile)return false;
 const f=dir+'/raw/'+file,stat=await fs.lstat(f);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>cfg.maxResponseBytes)throw Error('MODEL_SOURCE_LIMIT');let data;try{await fs.chmod(f,0o600);data=JSON.parse(await fs.readFile(f));}finally{await fs.chmod(f,stat.mode&0o777);}
 const actual=catalogLinkedModels(data,[anchor],cfg).find(r=>r.code===source.code);
 return Boolean(actual&&actual.url===source.url&&actual.images.some(im=>im.url===source.images[0]?.url));
}
export function catalogModelProduct(data,target){
 const exact=(Array.isArray(data?.model)?data.model:[]).filter(m=>m?.identifier===target.code);
 if(exact.length!==1)throw Error('EXACT_MODEL_UNVERIFIED');
 const model=exact[0],offer=model.offers?.priceSpecification;
 if(offer?.priceCurrency!=='KRW'||!Number.isFinite(Number(offer.price))||Number(offer.price)<=0)throw Error('COUNTRY_PRICE_UNVERIFIED');
 const published=model.url??model.offers?.url;
 let value;try{if(typeof published!=='string')throw Error();value=new URL(published,target.url).href;}catch{throw Error('MODEL_URL_UNVERIFIED');}
 const canonical=new URL(target.url??value);
 // A model may now use a different published slug/family from an older
 // sitemap. The SKU owns the offer; canonical remains the actual sitemap URL.
 if(new URL(value).origin!=='https://kr.louisvuitton.com'||!new URL(value).pathname.startsWith('/kor-kr/products/')||canonical.origin!=='https://kr.louisvuitton.com'||canonical.search||canonical.hash||canonical.username||canonical.password||louisVuittonCode(canonical.href)!==target.code)throw Error('MODEL_URL_UNVERIFIED');
 return {'@type':'Product',sku:target.code,name:data.name,url:canonical.href,offers:{price:Number(offer.price),priceCurrency:'KRW',url:canonical.href},image:model.image,color:model.color,material:model.material,size:model.size,dimensions:model.dimensions,description:model.disambiguatingDescription,detailedDescription:model.detailedDescription};
}
export function pendingCatalogModels(candidates,fields,runs,imageCodes=[]){
 const priced=new Set(fields.filter(f=>f.currency==='KRW'&&f.price>0).map(f=>f.code)),done=new Set();
 for(const run of runs){const own=run.rows.filter(r=>r.parentModel==='LV 공식 SKU 상품 모델 연결');
  if(own.some(r=>r.status==='ACCESS_BLOCKED'))return [];
  for(const r of own)if(r.status==='EXACT_MODEL_KRW_VERIFIED'&&own.some(r=>['NORMAL_HTTP_DOCUMENT_SAVED','CATALOG_MODEL_PROJECTION_SAVED'].includes(r.status))||r.status==='CATALOG_HTTP_FAILED'&&own.some(r=>r.status==='MODEL_PARSER_V3')||/^(?:CATALOG_(?:JSON_UNAVAILABLE|ITEM_REQUEST_HELD)|PRODUCT_ID_UNAVAILABLE|EXACT_MODEL_UNVERIFIED|COUNTRY_PRICE_UNVERIFIED)$/.test(r.status)||r.status==='MODEL_URL_UNVERIFIED'&&own.some(r=>/^MODEL_PARSER_V[23]$/.test(r.status)))done.add(r.variantCode);
 }
 return candidates.filter(c=>(!priced.has(c.code)||imageCodes.includes(c.code))&&!done.has(c.code));
}
export async function collectLouisVuittonCatalogModel(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),cfg=JSON.parse(await fs.readFile(process.argv[3])),run=process.env.CRAWL_RUN_DIR;
 if(cfg.country!=='KR'||!cfg.allowedHosts.includes('api.louisvuitton.com'))throw Error('CATALOG_COUNTRY_SCOPE');
 const base=root+'/crawler/completeness/louis-vuitton',rows=[],products=[],cache=new Map(),failures=new Map(),runs=[];
 const guard=async file=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');return JSON.parse(await fs.readFile(file));};
 for(const folder of ['expanded-catalog-source','public-reference','field-source'])await guard(base+'/'+folder+'/summary.json');
 const registered=new Set(readRegisteredLouisVuitton(root).map(r=>r.code));
 const candidates=JSON.parse(await fs.readFile(base+'/expanded-catalog-source/candidates.json')).filter(r=>!registered.has(r.code));
 const fields=JSON.parse(await fs.readFile(base+'/field-source/fields.json'));
 const read=async file=>{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>cfg.maxResponseBytes)throw Error('SOURCE_LIMIT');try{await fs.chmod(file,0o600);return await fs.readFile(file);}finally{await fs.chmod(file,s.mode&0o777);}};
 let refused=false;const runBase=root+'/crawler/runs/louis-vuitton/kr';
 for(const id of await fs.readdir(runBase)){
  if(runBase+'/'+id===run)continue;const file=runBase+'/'+id+'/summary.json';try{await fs.access(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}const proof=await guard(file);
  const own=proof.filter(r=>r.parentModel==='LV 공식 SKU 상품 모델 연결');if(!own.length)continue;
  runs.push({rows:proof});
  refused||=own.some(r=>r.status==='ACCESS_BLOCKED');
  for(const r of own)if(r.status==='CATALOG_HTTP_404')failures.set(r.officialUrl,404);
  const legacy=id==='20261016T233606Z-69293';let n=0;
  for(const r of own.filter(r=>/^CATALOG_HTTP_\d+$/.test(r.status))){n++;if(r.status!=='CATALOG_HTTP_200')continue;const file=runBase+'/'+id+'/raw/'+(legacy?'':'api-')+n+'.source';try{await fs.access(file,0);cache.set(r.officialUrl,file);}catch(e){if(e.code!=='ENOENT')throw e;}}
 }
 let target=candidates.find(c=>c.code==='M29090')??candidates[0],url=cfg.entryUrl,calls=0;
 const row=(status,price=null)=>({brand:'louis-vuitton',country:'KR',parentModel:'LV 공식 SKU 상품 모델 연결',variantCode:target?.code??'SOURCE',price,currency:'KRW',status,officialUrl:url});
 const controlDone=runs.some(r=>r.rows.some(s=>s.status==='EXACT_MODEL_KRW_VERIFIED'&&s.variantCode==='M29090'));
 const workflow=JSON.parse(await fs.readFile(root+'/crawler/runtime/louis-vuitton-browser/workflow.json'));
 const targets=[...(!controlDone?[target]:[]),...pendingCatalogModels(candidates,fields,runs,Object.keys(workflow.ingestHeld??{})).filter(c=>c.code!==target.code)].slice(0,Math.min(25,cfg.maxProductsPerRun));
 rows.push(row('MODEL_PARSER_V3'));
 const persist=async()=>{
  if(products.length){await fs.writeFile(run+'/raw/1.source','<script type="application/ld+json">'+JSON.stringify(products).replaceAll('<','\\u003c')+'</script>',{mode:0o600});}
  const output=products.length?[{...row('CATALOG_MODEL_PROJECTION_SAVED'),officialUrl:products[0].url,variantCode:products[0].sku},...rows]:rows;
  await fs.writeFile(run+'/summary.json',JSON.stringify(output),{mode:0o600});
 };
 const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
 try{
  if(refused)throw Error('CATALOG_ACCESS_STOP_RETAINED');
  if(!candidates.length){rows.push(row('NO_UNREGISTERED_CANDIDATES'));await persist();return;}
  const get=async()=>{
   if(louisVuittonAccessStops.has(url))throw Error('CATALOG_ITEM_REQUEST_HELD');
   if(cache.has(url)){rows.push(row('CATALOG_CACHE_REUSED'));return JSON.parse(await read(cache.get(url)));}
   if(failures.has(url))throw Object.assign(Error('CATALOG_HTTP_FAILED'),{httpStatus:failures.get(url)});
   if(calls>=Math.min(cfg.maxRequestsPerRun,80))throw Error('REQUEST_LIMIT');
   const marker=root+'/crawler/runtime/louis-vuitton-browser/catalog-api-'+createHash('sha256').update(url).digest('hex')+'.json';
   const h=await fs.open(marker,'wx',0o600);await h.writeFile(JSON.stringify({run}));await h.close();
   if(calls)await new Promise(resolve=>setTimeout(resolve,2000));
   const r=await client.get(url,{maxRedirects:0});rows.push(row('CATALOG_HTTP_'+r.status()));calls++;
   await persist();if([401,403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');
   if(!r.ok())throw Object.assign(Error('CATALOG_HTTP_FAILED'),{httpStatus:r.status()});
   const body=await r.body();if(body.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(body.toString(),r.status());
   const file=run+'/raw/api-'+calls+'.source';await fs.writeFile(file,body,{mode:0o600});cache.set(url,file);
   try{return JSON.parse(body);}catch{throw Error('CATALOG_JSON_UNAVAILABLE');}
  };
  for(target of targets){
   if(louisVuittonCode(target.url)!==target.code)throw Error('CATALOG_IDENTITY');
   try{url=catalogModelUrl('sku',target.code);let productId;
    try{productId=(await get()).productId;}catch(e){if(e.httpStatus!==404)throw e;productId=catalogFamilyId(target.url);rows.push(row('PUBLISHED_FAMILY_DIRECT_LOOKUP'));}
    if(!productId)throw Error('PRODUCT_ID_UNAVAILABLE');
    url=catalogModelUrl('product',productId);const data=await get();const product=catalogModelProduct(data,target);products.push(product);url=product.url;rows.push(row('EXACT_MODEL_KRW_VERIFIED',product.offers.price));
   }catch(e){if(e.code==='EEXIST'){rows.push(row('CATALOG_ITEM_REQUEST_HELD'));continue;}if(['PRODUCT_ID_UNAVAILABLE','EXACT_MODEL_UNVERIFIED','COUNTRY_PRICE_UNVERIFIED','MODEL_URL_UNVERIFIED','CATALOG_HTTP_FAILED','CATALOG_JSON_UNAVAILABLE'].includes(e.message)){rows.push(row(e.message));continue;}throw e;}
   await persist();
  }
 }catch(e){rows.push(row(e.code==='EEXIST'?'CATALOG_ROUTE_ALREADY_ATTEMPTED':/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'CATALOG_SOURCE_FAILED'));process.exitCode=1;}
 finally{rows.push(row('CATALOG_REQUESTS_'+calls));await client.dispose();await persist();}
}
