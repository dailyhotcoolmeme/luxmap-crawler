import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';
import {validatedBottegaApiProduct,publishedBottegaColorOption} from './bottega-api-product.js';
export async function collectBottegaApiMarkets(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);if(args.length!==5||args[0]!=='--country-config'||args[2]!=='--prices-from-published-route'||args[3]!=='--targets-file')throw Error('INVALID_MODE');
 const cfg=JSON.parse(await fs.readFile(args[1])),input=JSON.parse(await fs.readFile(args[4])),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..'),artifact=path.join(run,'artifacts'),base=path.join(root,'crawler/runs/bottega-veneta',cfg.country.toLowerCase()),master=JSON.parse(await fs.readFile(path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json')));
 if(cfg.country==='KR'||!Array.isArray(input)||!input.length||input.length>cfg.maxProductsPerRun||new Set(input.map(t=>t.normalizedCode)).size!==input.length||input.some(t=>!master.some(p=>p.normalizedCode===t.normalizedCode)))throw Error('INVALID_TARGETS');
 const refs=input.map(t=>master.find(p=>p.normalizedCode===t.normalizedCode)),rows=[],records=[],extras=[],context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});let calls=0;
 await fs.mkdir(artifact,{recursive:true});
 const save=async()=>{await fs.writeFile(path.join(artifact,'records.json'),JSON.stringify(records),{mode:0o600});await fs.writeFile(path.join(artifact,'extra-native-targets.json'),JSON.stringify(extras),{mode:0o600});await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows));};
 try{
  let route;
  for(const name of (await fs.readdir(base)).sort().reverse()){
   const dir=path.join(base,name);if(dir===run)continue;let files;try{files=await fs.readdir(path.join(dir,'raw'));}catch{continue;}
   for(const name of files.filter(n=>/^\d+\.source$/.test(n)).slice(0,5)){
    const file=path.join(dir,'raw',name),s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8*1024*1024)throw Error('INVALID_PROOF');let html;try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,s.mode&0o777);}
    for(const m of html.matchAll(/(?:href|action|data-[\w-]*url|data-action)=["']([^"']+)["']/gi))try{const u=new URL(decodeHtml(m[1]),cfg.entryUrl),locale=cfg.locale.replace('-','_'),own=u.pathname===`${cfg.localePrefix}Product-Variation`||(u.pathname.startsWith('/on/demandware.store/Sites-')&&u.pathname.endsWith(`/${locale}/Product-Variation`));if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='www.bottegaveneta.com'&&own&&[...u.searchParams.keys()].some(k=>/^dwvar_[A-Z0-9]{15}_color$/i.test(k)))route=u;}catch{}
    if(route)break;
   }if(route)break;
  }
  if(!route)throw Error('PUBLISHED_VARIATION_ROUTE_MISSING');
  const size=[...route.searchParams.entries()].some(([k,v])=>/^dwvar_[A-Z0-9]{15}_size$/i.test(k)&&v==='U'),quantity=route.searchParams.get('quantity');
  for(const ref of refs){
   const row=(status,price=null,url=cfg.entryUrl)=>({brand:cfg.brand,country:cfg.country,parentModel:ref.parentModel.slice(0,120),variantCode:ref.normalizedCode,price,currency:cfg.currency,status,officialUrl:url});
   try{
    const target=new URL(route.href);target.search='';target.searchParams.set('pid',ref.normalizedCode);target.searchParams.set(`dwvar_${ref.normalizedCode}_color`,ref.normalizedCode.slice(-4));if(size)target.searchParams.set(`dwvar_${ref.normalizedCode}_size`,'U');if(quantity==='1')target.searchParams.set('quantity','1');let url=target.href,body;
    for(let hop=0;hop<4;hop++){
     const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.bottegaveneta.com'||u.username||u.password||!(u.pathname===route.pathname||u.pathname.startsWith(cfg.localePrefix)))throw Error('UNAUTHORIZED_URL');
     if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const response=await context.get(url,{maxRedirects:0});if([403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if([301,302,303,307,308].includes(response.status())){url=new URL(response.headers().location,url).href;continue;}if(!response.ok())throw Error(`HTTP_${response.status()}`);
     body=await response.body();if(body.length>8*1024*1024)throw Error('RESPONSE_LIMIT');await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});await fs.writeFile(path.join(run,'raw',`${calls}.request.json`),JSON.stringify({requestedUrl:target.href,responseUrl:url,country:cfg.country}),{mode:0o600});break;
    }
    if(!body)throw Error('REDIRECT_LIMIT');const text=body.toString('utf8');if(/captcha-delivery|cf-chl|challenge-platform|px-captcha|verify you are human/i.test(text))throw Error('ACCESS_BLOCKED');let api;try{api=JSON.parse(text);}catch{throw Error('EXPECTED_API_JSON_MISSING');}
    if(String(api.product?.id)!==ref.sourceProductId&&String(api.product?.id)!==ref.normalizedCode){const alternative=publishedBottegaColorOption(api,ref,url);if(alternative&&alternative!==url){const u=new URL(alternative);if(u.protocol!=='https:'||u.hostname!=='www.bottegaveneta.com'||u.username||u.password||u.pathname!==route.pathname)throw Error('UNAUTHORIZED_URL');if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const response=await context.get(alternative,{maxRedirects:0});if([403,429].includes(response.status()))throw Error('ACCESS_BLOCKED');if(!response.ok())throw Error(`HTTP_${response.status()}`);const next=await response.body();if(next.length>8*1024*1024)throw Error('RESPONSE_LIMIT');const t=next.toString('utf8');if(/captcha-delivery|cf-chl|challenge-platform|px-captcha|verify you are human/i.test(t))throw Error('ACCESS_BLOCKED');await fs.writeFile(path.join(run,'raw',`${calls}.source`),next,{mode:0o600});await fs.writeFile(path.join(run,'raw',`${calls}.request.json`),JSON.stringify({requestedUrl:target.href,responseUrl:alternative,country:cfg.country}),{mode:0o600});try{api=JSON.parse(t);}catch{throw Error('EXPECTED_API_JSON_MISSING');}}}
    const value=validatedBottegaApiProduct(api,ref,cfg,master,{allowMissingPrice:true}),priceStatus=value.price===null?'price_unavailable':'confirmed';records.push({...value,productName:ref.productName??ref.parentModel,priceStatus,checkedAt:new Date().toISOString()});extras.push({normalizedCode:ref.normalizedCode,parentModel:ref.parentModel,sourceProductId:ref.sourceProductId,officialUrl:value.officialUrl});rows.push(row(priceStatus,value.price,value.officialUrl));await save();
   }catch(error){if(['UNAUTHORIZED_URL','REQUEST_LIMIT','ACCESS_BLOCKED','RESPONSE_LIMIT','REDIRECT_LIMIT','INVALID_PROOF'].includes(error.message))throw error;rows.push(row(/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'COUNTRY_API_PRICE_FAILED'));await save();}
  }
 }catch(error){const status=/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'COUNTRY_API_SOURCE_FAILED';rows.push({brand:cfg.brand,country:cfg.country,parentModel:'공식 옵션 API의 한국 동일 상품 대조',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl});await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:status}));process.exitCode=1;}
 finally{await save();await context.dispose();}
}
