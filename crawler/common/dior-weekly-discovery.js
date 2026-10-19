import crypto from 'node:crypto';
import {validateDiorPublishedRoutes} from './dior-weekly-routes.js';
export function deriveDiorWeeklyListing(source,canonical,control,observedAt){
 if(typeof source!=='string'||Buffer.byteLength(source)>8388608||!Number.isFinite(Date.parse(observedAt)))throw Error('DISCOVERY_SOURCE_BOUND');
 const u=new URL(canonical);if(u.origin!=='https://www.dior.com'||u.username||u.password||u.search||u.hash||!/^\/ko_kr\/fashion\/(?:womens-fashion|mens-fashion)\/bags\/(?:all-the-bags|all-bags)$/.test(u.pathname))throw Error('DISCOVERY_LIST_SCOPE');
 validateDiorPublishedRoutes({schema:1,country:'KR',routes:[control]},'KR');if(!control.canonical.includes('/products/'))throw Error('DISCOVERY_CONTROL');
 const prefix=control.url.slice(0,control.url.indexOf('/ko_kr/fashion/')),doc=JSON.parse(source),p=doc.pageProps,dict=p?.queriesProductsDictionnary;
 if(p?.locale!=='ko_kr'||!dict||Array.isArray(dict)||Object.keys(dict).length>100)throw Error('DISCOVERY_LIST_IDENTITY');
 const posted=p.content?.canonicalPathname;if(posted&&decodeURIComponent(new URL(posted,u.origin).pathname)!==decodeURIComponent(u.pathname))throw Error('DISCOVERY_LIST_IDENTITY');
 const found=new Map();let hits=0;
 // nbHits is upstream search metadata, not the count of published exact-code
 // cards (the real retained lists demonstrate this difference). Count actual
 // bound cards, never promote nbHits into a completion/discovery count.
 for(const q of Object.values(dict)){if(!Array.isArray(q?.hits)||q.hits.length>10000)continue;if(q.nbPages!=null&&q.nbPages!==1||q.page!=null&&q.page!==0)throw Error('DISCOVERY_PAGINATION_INCOMPLETE');
  for(const h of q.hits){hits++;if(hits>10000)throw Error('DISCOVERY_CANDIDATE_LIMIT');let c;try{c=new URL(h.productLink?.uri,u.origin);}catch{continue;}const m=c.pathname.match(/^\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)$/),code=String(h.code??'').replaceAll('_','');if(c.origin!==u.origin||c.search||c.hash||c.username||c.password||!m||m[1].replaceAll('_','')!==code||h.price?.currency!=='KRW'||!(h.price.value>0))continue;
   found.set(code,{url:prefix+c.pathname+'.json',canonical:c.href,observedAt,responseSha256:crypto.createHash('sha256').update(source).digest('hex'),proofKind:'posted-rule-listing-canonical',controlUrl:control.url});
  }
 }
 const routes=[...found.values()];validateDiorPublishedRoutes({schema:1,country:'KR',routes},'KR');return routes;
}
