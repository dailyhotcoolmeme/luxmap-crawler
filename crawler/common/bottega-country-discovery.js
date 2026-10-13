import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeHtml} from './prada-product.js';
export async function discoverBottegaCountry(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);if(![3,5].includes(args.length)||args[0]!=='--country-config'||args[2]!=='--discover-native'||(args.length===5&&args[3]!=='--native-state-file'))throw Error('INVALID_MODE');
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,artifact=path.join(run,'artifacts'),context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000}),rows=[],links=new Set();let calls=0,docs=0;
 await fs.mkdir(artifact,{recursive:true});
 const row=status=>({brand:cfg.brand,country:cfg.country,parentModel:'공식 국가 사이트맵 가격 URL 색인',variantCode:'INDEX',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl});
 async function get(value){let url=value;for(let h=0;h<4;h++){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!cfg.allowedHosts.includes(u.hostname))throw Error('UNAUTHORIZED_URL');if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const r=await context.get(url,{maxRedirects:0});if([403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if([301,302,303,307,308].includes(r.status())){url=new URL(r.headers().location,url).href;continue;}if(!r.ok())throw Error(`HTTP_${r.status()}`);const body=await r.body();if(body.length>8*1024*1024)throw Error('RESPONSE_LIMIT');await fs.writeFile(path.join(run,'raw',`${calls}.source`),body,{mode:0o600});return body.toString('utf8');}throw Error('REDIRECT_LIMIT');}
 try{
  const queue=[],seen=new Set();
  const localeMatch=u=>u.toLowerCase().includes(cfg.localePrefix.replaceAll('/',''))||u.toLowerCase().includes(cfg.localePrefix.replaceAll('/','').replace('-','_'));
  if(args.length===5){const state=JSON.parse(await fs.readFile(args[4]));if(state.brand!==cfg.brand||state.country!==cfg.country||Date.now()-Date.parse(state.checkedAt)>86400000)throw Error('INVALID_NATIVE_STATE');for(const u of [...state.seen,...state.pending,...state.urls]){const v=new URL(u);if(v.protocol!=='https:'||!cfg.allowedHosts.includes(v.hostname))throw Error('INVALID_NATIVE_STATE');}state.seen.forEach(u=>seen.add(u));queue.push(...state.pending);state.urls.forEach(u=>links.add(u));}
  else{const robots=await get(new URL('/robots.txt',cfg.entryUrl).href),declared=[...robots.matchAll(/^Sitemap:\s*(https:\/\/\S+)/gim)].map(m=>m[1]).filter(u=>cfg.allowedHosts.includes(new URL(u).hostname)),preferred=declared.filter(localeMatch);queue.push(...(preferred.length?preferred:declared));}
  const checkpoint=async()=>{await fs.writeFile(path.join(artifact,'native-state.json'),JSON.stringify({brand:cfg.brand,country:cfg.country,checkedAt:new Date().toISOString(),seen:[...seen],pending:queue,urls:[...links]}),{mode:0o600});await fs.writeFile(path.join(artifact,'native-urls.json'),JSON.stringify([...links]),{mode:0o600});};
  if(!queue.length)throw Error('DECLARED_SITEMAP_MISSING');
  while(queue.length){
   if(docs>=cfg.maxNativeDiscoveryPages){await checkpoint();throw Error('DISCOVERY_BATCH_PENDING');}
   const url=queue.shift();if(seen.has(url))continue;seen.add(url);const xml=await get(url);docs++;
   const locs=[...xml.matchAll(/<(?:\w+:)?loc[^>]*>([\s\S]*?)<\/(?:\w+:)?loc>/gi)].map(m=>decodeHtml(m[1].replace(/<!\[CDATA\[|\]\]>/g,'').trim()));
   if(/<sitemapindex[\s>]/i.test(xml)){
    const own=locs.filter(u=>{try{return cfg.allowedHosts.includes(new URL(u).hostname);}catch{return false;}}),preferred=own.filter(localeMatch);
    queue.push(...(preferred.length?preferred:own));
   }else if(/<urlset[\s>]/i.test(xml))for(const raw of locs)try{const u=new URL(raw);if(cfg.allowedHosts.includes(u.hostname)&&u.pathname.startsWith(cfg.localePrefix)&&/(?:[A-Z0-9]{15}|\d{8,10})\.html$/i.test(u.pathname))links.add(u.href);}catch{}
   else throw Error('UNSUPPORTED_SITEMAP_FORMAT');
   await checkpoint();
   await fs.writeFile(path.join(run,'summary.json'),JSON.stringify([row(`SITEMAP_DOCS_${docs}`),row(`NATIVE_URLS_${links.size}`)]));
  }
  if(!links.size)throw Error('NATIVE_INDEX_EMPTY');
  await fs.writeFile(path.join(artifact,'native-urls.json'),JSON.stringify([...links]),{mode:0o600});rows.push(row(`SITEMAP_DOCS_${docs}`),row(`NATIVE_URLS_${links.size}`),row('DECLARED_SITEMAPS_TRAVERSED'));
 }catch(error){rows.push(row(/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'SOURCE_REQUEST_FAILED'));await fs.writeFile(path.join(run,'failure.json'),JSON.stringify({failureCode:rows.at(-1).status}));process.exitCode=1;
 }finally{await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows));await context.dispose();}
}
