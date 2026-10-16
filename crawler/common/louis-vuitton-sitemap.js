import fs from 'node:fs/promises';
import path from 'node:path';
import {request} from 'playwright-core';
import {decodeLouisVuitton,louisVuittonAccess,louisVuittonCode} from './louis-vuitton-product.js';

// Ordinary HTTP only. Follow sitemap URLs actually declared by official robots
// and sitemap indexes; never derive endpoints from blocked product URLs.
export async function discoverLouisVuittonSitemap(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--country-config'||args[2]!=='--probe-sitemap-source')throw Error('SOURCE_SCOPE');
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,origin=new URL(cfg.entryUrl).origin;
 if(cfg.brand!=='louis-vuitton'||cfg.country!=='KR')throw Error('COUNTRY_SCOPE');
 const rows=[],products=new Set(),seen=new Set();let calls=0,active=origin+'/robots.txt';
 const row=status=>rows.push({brand:cfg.brand,country:'KR',parentModel:'공식 robots 사이트맵 발견',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:active});
 const safe=value=>{const u=new URL(decodeLouisVuitton(value));if(u.origin!==origin||u.username||u.password||u.hash)throw Error('UNAUTHORIZED_URL');return u.href;};
 const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs});
 async function get(url){active=safe(url);if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');const r=await client.get(active,{maxRedirects:0});row('HTTP_'+r.status());if([401,403,429].includes(r.status()))throw Error('ACCESS_BLOCKED');if(!r.ok())throw Error('HTTP_'+r.status());const b=await r.body();if(b.length>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');const text=b.toString();louisVuittonAccess(text,r.status());await fs.writeFile(path.join(run,'raw',calls+'.source'),b,{mode:0o600});return text;}
 try{
  const robots=await get(active),queue=[...new Set([...robots.matchAll(/^Sitemap:\s*(https:\/\/\S+)/gim)].map(m=>safe(m[1])))];
  if(!queue.length)throw Error('NO_DECLARED_SITEMAP');row('DECLARED_SITEMAPS_'+queue.length);
  while(queue.length){if(seen.size>=cfg.maxDiscoveryPages)throw Error('DISCOVERY_LIMIT');const url=queue.shift();if(seen.has(url))continue;seen.add(url);const xml=await get(url);const locations=[...xml.matchAll(/<loc\b[^>]*>([^<]+)<\/loc>/gi)].map(m=>decodeLouisVuitton(m[1].trim()));
   if(/<sitemapindex\b/i.test(xml)){for(const loc of locations){const declared=safe(loc);if(!seen.has(declared)&&!queue.includes(declared))queue.push(declared);}}
   else if(/<urlset\b/i.test(xml)){for(const loc of locations){const published=safe(loc),u=new URL(published);if(u.pathname.startsWith(cfg.localePrefix)&&louisVuittonCode(published)){products.add(published);if(products.size>cfg.maxCandidates)throw Error('CANDIDATE_LIMIT');}}}
   else throw Error('SITEMAP_FORMAT_UNRESOLVED');
  }
  row('CANDIDATES_'+products.size);row('DISCOVERY_ONLY_NOT_INGESTED');
 }catch(e){row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'SOURCE_FAILED');process.exitCode=/UNAUTHORIZED|LIMIT|GUARD/.test(e.message)?78:1;}
 finally{await fs.mkdir(path.join(run,'artifacts'),{recursive:true});await fs.writeFile(path.join(run,'artifacts/discovery-candidates.json'),JSON.stringify([...products]),{mode:0o600});await fs.writeFile(path.join(run,'artifacts/records.json'),'[]',{mode:0o600});await fs.writeFile(path.join(run,'summary.json'),JSON.stringify(rows),{mode:0o600});await client.dispose();}
}
