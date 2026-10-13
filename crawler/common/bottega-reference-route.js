import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';
import {parseBottegaProduct} from './bottega-product.js';
export async function probeBottegaReferenceRoute(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);if(![3,5].includes(args.length)||args[0]!=='--country-config'||args[2]!=='--probe-reference-route'||(args.length===5&&args[3]!=='--targets-file'))throw Error('INVALID_MODE');
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,root=path.resolve(import.meta.dirname,'../..'),base=path.join(root,'crawler/runs/bottega-veneta',cfg.country.toLowerCase()),artifact=path.join(run,'artifacts');await fs.mkdir(artifact,{recursive:true});
 const master=JSON.parse(await fs.readFile(path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata/validated-products.json')));let p;if(args.length===5){const input=JSON.parse(await fs.readFile(args[4]));if(!Array.isArray(input)||input.length!==1)throw Error('ONE_REFERENCE_REQUIRED');p=master.find(r=>r.normalizedCode===input[0].normalizedCode);if(!p)throw Error('UNKNOWN_REFERENCE');}else{const targets=JSON.parse(await fs.readFile(path.join(root,'crawler/completeness/bottega-veneta/country-targets',cfg.country.toLowerCase(),'targets.json')));p=master.find(p=>!targets.some(t=>t.normalizedCode===p.normalizedCode));}
 const rows=[],context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});
 const row=(status,price=null,url=cfg.entryUrl)=>({brand:cfg.brand,country:cfg.country,parentModel:p?.parentModel??'공식 상품 번호 조회 경로 검증',variantCode:p?.normalizedCode??'RUN',price,currency:cfg.currency,status,officialUrl:url});
 try{
  if(!p)throw Error('NO_MISSING_REFERENCE');let route;
  for(const dir of (await fs.readdir(base)).sort().reverse()){
   if(path.join(base,dir)===run)continue;const raw=path.join(base,dir,'raw');let names;try{names=await fs.readdir(raw);}catch{continue;}
   for(const name of names.filter(n=>/^\d+\.source$/.test(n)).slice(0,5)){
    const file=path.join(raw,name),s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>8*1024*1024)throw Error('INVALID_PROOF');let html;try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,s.mode&0o777);}
    if(!/[?&](?:amp;)?pid=|(?:name=["']pid["']|data-pid=["'])/i.test(html))continue;
    const published=[...html.matchAll(/(?:href|action|data-[\w-]*url|data-action)=["']([^"']+)["']/gi)].map(m=>m[1]);for(const m of html.matchAll(/["']((?:https:\/\/www\.bottegaveneta\.com)?\/[a-z]{2}-[a-z]{2}\/Product-Show(?:\?[^"']*)?)["']/gi))published.push(m[1]);
    for(const value of published)try{const u=new URL(decodeHtml(value),cfg.entryUrl),locale=cfg.locale.replace('-','_'),own=(u.pathname.startsWith(cfg.localePrefix)&&/\/(?:Product-Show|Product-Variation)$/.test(u.pathname))||(u.pathname.startsWith('/on/demandware.store/Sites-')&&new RegExp(`/${locale}/(?:Product-Show|Product-Variation)$`).test(u.pathname));if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='www.bottegaveneta.com'&&own)route=u;}catch{}
    if(route)break;
   }if(route)break;
  }
  if(!route)throw Error('PUBLISHED_ROUTE_MISSING');const colorTemplate=[...route.searchParams.keys()].some(k=>/^dwvar_[A-Z0-9]{15}_color$/i.test(k)),sizeTemplate=[...route.searchParams.entries()].some(([k,v])=>/^dwvar_[A-Z0-9]{15}_size$/i.test(k)&&v==='U'),quantity=route.searchParams.get('quantity');route.search='';route.searchParams.set('pid',p.normalizedCode);if(colorTemplate)route.searchParams.set(`dwvar_${p.normalizedCode}_color`,p.normalizedCode.slice(-4));if(sizeTemplate)route.searchParams.set(`dwvar_${p.normalizedCode}_size`,'U');if(quantity==='1')route.searchParams.set('quantity','1');let url=route.href,html;
  for(let call=1;call<=4;call++){
   const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='www.bottegaveneta.com'||!(u.pathname.startsWith(cfg.localePrefix)||u.pathname===route.pathname)||u.username||u.password)throw Error('UNAUTHORIZED_URL');
   const r=await context.get(url,{maxRedirects:0});if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if([301,302,303,307,308].includes(r.status())){url=new URL(r.headers().location,url).href;continue;}if(!r.ok())throw Error(`HTTP_${r.status()}`);
   const body=await r.body();if(body.length>8*1024*1024)throw Error('RESPONSE_LIMIT');await fs.writeFile(path.join(run,'raw',`${call}.source`),body,{mode:0o600});html=body.toString('utf8');break;
  }
  if(!html)throw Error('REDIRECT_LIMIT');if(/captcha-delivery|cf-chl|challenge-platform|px-captcha|verify you are human/i.test(html))throw Error('ACCESS_BLOCKED');
  let api;try{api=JSON.parse(html);}catch{}
  if(api?.product){const product=api.product,amount=product.price?.sales,canonicalValue=product.selectedProductUrl??api.selectedProductUrl??product.productUrl??product.url,apiId=String(product.id).replace(/[^A-Z0-9]/gi,'').toUpperCase();if(apiId!==p.normalizedCode){rows.push({...row(`API_ID_KR_MATCH_${apiId===p.sourceProductId?1:0}`),variantCode:/^[A-Z0-9]{1,40}$/.test(apiId)?apiId:'RUN'});throw Error('MANUFACTURER_REFERENCE_MISMATCH');}if(amount?.currency!==cfg.currency||!Number.isFinite(Number(amount.value))||Number(amount.value)<=0)throw Error('INVALID_PRICE');if(!canonicalValue)throw Error('CANONICAL_COUNTRY_URL_MISSING');const canonical=new URL(canonicalValue,route.href),pathname=decodeURIComponent(canonical.pathname).toUpperCase();if(canonical.protocol!=='https:'||canonical.hostname!=='www.bottegaveneta.com'||canonical.username||canonical.password||!canonical.pathname.startsWith(cfg.localePrefix)||!(pathname.endsWith(`${p.normalizedCode}.HTML`)||(/^\d{8,10}$/.test(p.sourceProductId??'')&&pathname.endsWith(`${p.sourceProductId}.HTML`))))throw Error('CANONICAL_REFERENCE_MISMATCH');rows.push(row('PRICE_ROUTE_CONFIRMED',Number(amount.value),canonical.href));await fs.writeFile(path.join(artifact,'route-targets.json'),JSON.stringify([{normalizedCode:p.normalizedCode,parentModel:p.parentModel,sourceProductId:p.sourceProductId,officialUrl:canonical.href}]),{mode:0o600});return;}
  const products=[],visit=v=>{if(!v||typeof v!=='object')return;if([v['@type']].flat().includes('Product'))products.push(v);Object.values(v).forEach(visit);};for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{visit(JSON.parse(m[1]));}catch{}
  if(products.length!==1)throw Error('PRODUCT_SCOPE_AMBIGUOUS');const offer=[products[0].offers].flat().find(o=>o?.priceCurrency===cfg.currency);if(!offer?.url)throw Error('CANONICAL_COUNTRY_URL_MISSING');const canonical=new URL(decodeHtml(offer.url),url).href;
  const actual=parseBottegaProduct(html,canonical,cfg,{expectedCode:p.normalizedCode,expectedProductId:p.sourceProductId,requireImageReference:false});
  rows.push(row('PRICE_ROUTE_CONFIRMED',actual.price,canonical));await fs.writeFile(path.join(artifact,'route-targets.json'),JSON.stringify([{normalizedCode:p.normalizedCode,parentModel:p.parentModel,sourceProductId:p.sourceProductId,officialUrl:canonical}]),{mode:0o600});
 }catch(error){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'REFERENCE_ROUTE_FAILED'));await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:rows.at(-1).status}));process.exitCode=1;}
 finally{await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows));await context.dispose();}
}
