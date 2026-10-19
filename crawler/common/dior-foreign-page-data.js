import {celineNodes} from './celine-html.js';
import {diorPageDataProduct} from './dior-page-data.js';
export const diorForeignLocales={JP:'ja_jp',FR:'fr_fr',IT:'it_it',ES:'es_es',US:'en_us',SG:'en_sg',HK:'en_hk'};
const norm=v=>String(v??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
// Expand a published framework route only for its own canonical document,
// or an explicitly linked localized version of the same product. Never
// replace locale strings in an unobserved product URL.
export function diorForeignDataRoute(html,canonical,country){
 if(typeof html!=='string'||Buffer.byteLength(html)>8388608)return null;
 let u;try{u=new URL(canonical);}catch{return null;}
 const locale=diorForeignLocales[country];if(!locale||u.origin!=='https://www.dior.com'||u.search||u.hash||u.username||u.password||!u.pathname.startsWith('/'+locale+'/fashion/'))return null;
 const nodes=celineNodes(html),cs=nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');if(cs.length!==1)return null;
 const matches=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>/\bid\s*=\s*["']__NEXT_DATA__["']/.test(m[1])&&/application\/json/i.test(m[1]));if(matches.length!==1)return null;
 let d;try{d=JSON.parse(matches[0][2]);}catch{return null;}const q=d.query,p=d.props?.pageProps;
 if(!d.gsp||!(/^[A-Za-z0-9_-]{1,100}$/).test(d.buildId)||typeof d.page!=='string'||!d.page.includes('[locale]')||!q||p?.locale!==q.locale)return null;
 let own;try{own=new URL(cs[0].attrs.href);}catch{return null;}
 if(own.origin!==u.origin||own.search||own.hash||own.pathname.split('/')[1]!==q.locale)return null;
 const product=u.pathname.match(/\/products\/([A-Z0-9]+_[A-Z0-9]+)$/);
 if(product){
  const ownCode=own.pathname.match(/\/products\/([A-Z0-9]+_[A-Z0-9]+)$/)?.[1];
  if(!d.page.endsWith('/products/[identifier]')||!ownCode||norm(q.identifier)!==norm(ownCode)||norm(p.identifier)!==norm(ownCode)||norm(product[1])!==norm(ownCode))return null;
  if(canonical!==own.href&&!nodes.some(n=>['a','link'].includes(n.tag)&&n.attrs.href&&new URL(n.attrs.href,own).href===canonical))return null;
 }else{
  if(canonical!==own.href||q.locale!==locale||!d.page.endsWith('/[[...path]]')||!Array.isArray(q.path)||q.universe!=='fashion'||own.pathname!=='/'+locale+'/fashion/'+q.path.join('/')||!/^\/(?:[a-z]{2}_[a-z]{2})\/fashion\/(?:womens-fashion|mens-fashion)\/bags(?:\/[a-z0-9-]+)?$/.test(own.pathname))return null;
 }
 return {canonical,url:'https://www.dior.com/_next/data/'+d.buildId+u.pathname+'.json',country};
}

// A normal KR product JSON explicitly publishes its localized canonical
// alternatives. Bind those literal URLs to the already proven foreign
// framework control; do not synthesize country product paths.
export function diorForeignLinkedDataRoute(source,routingHtml,controlUrl,canonical,country){
 let control;try{control=new URL(controlUrl);}catch{return null;}
 const cm=control.pathname.match(/^\/_next\/data\/([A-Za-z0-9_-]+)(\/[a-z]{2}_[a-z]{2}\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+)\.json$/);if(!cm||control.origin!=='https://www.dior.com')return null;
 const bound=diorForeignDataRoute(routingHtml,'https://www.dior.com'+cm[2],country);if(!bound||bound.url!==controlUrl)return null;
 let d;try{d=JSON.parse(source);}catch{return null;}const props=d.pageProps,p=props?.product;if(props?.locale!=='ko_kr'||!p)return null;
 let own;try{own=new URL(props.content?.canonicalPathname,'https://www.dior.com').href;if(!diorPageDataProduct(source,own,p.code))return null;}catch{return null;}
 let target;try{target=new URL(canonical);}catch{return null;}
 const code=target.pathname.match(new RegExp('^/'+diorForeignLocales[country]+'/fashion/products/([A-Z0-9]+_[A-Z0-9]+)$'))?.[1];
 if(target.origin!=='https://www.dior.com'||target.search||target.hash||!code||norm(code)!==norm(p.code)||!Array.isArray(props.content?.alternates)||!props.content.alternates.some(a=>{try{return new URL(a.path,'https://www.dior.com').href===canonical;}catch{return false;}}))return null;
 return {canonical,country,url:'https://www.dior.com/_next/data/'+cm[1]+target.pathname+'.json'};
}

// The same published static catch-all handles localized bag-category links.
// Require a real local navigation link, the posted SG static route, and a
// successful data control for this country sharing that exact build.
export function diorForeignLinkedListingRoute(source,staticHtml,controlUrl,canonical,country){
 const locale=diorForeignLocales[country];let u,control,d;
 try{u=new URL(canonical);control=new URL(controlUrl);d=JSON.parse(source);}catch{return null;}
 if(!locale||u.origin!=='https://www.dior.com'||u.search||u.hash||!u.pathname.startsWith('/'+locale+'/fashion/')||!/(?:^|\/)(?:bags|sacs|borse|bolsos|バッグ)(?:\/|$)/.test(decodeURI(u.pathname))||/\/products\//.test(u.pathname))return null;
 const nodes=celineNodes(staticHtml),cs=nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');if(cs.length!==1)return null;
 const prototype=diorForeignDataRoute(staticHtml,cs[0].attrs.href,'SG'),m=control.pathname.match(new RegExp('^/_next/data/([A-Za-z0-9_-]+)/'+locale+'/fashion/products/[A-Z0-9]+_[A-Z0-9]+\\.json$'));
 if(!prototype||control.origin!=='https://www.dior.com'||control.search||control.hash||!m||!prototype.url.startsWith('https://www.dior.com/_next/data/'+m[1]+'/'))return null;
 const p=d.pageProps,product=p?.product,currency={JP:'JPY',FR:'EUR',IT:'EUR',ES:'EUR',US:'USD',SG:'SGD',HK:'HKD'}[country];
 let own;try{own=new URL(p?.content?.canonicalPathname,'https://www.dior.com');}catch{return null;}
 const ownCode=own.pathname.match(new RegExp('^/'+locale+'/fashion/products/([A-Z0-9]+_[A-Z0-9]+)$'))?.[1];
 if(p?.locale!==locale||own.origin!==u.origin||!ownCode||norm(p.identifier)!==norm(ownCode)||norm(product?.code)!==norm(ownCode)||norm(product?.backendSku)!==norm(ownCode)||product.price?.currency!==currency||!(product.price.value>0))return null;
 let found=false,visited=0;function visit(v,key,depth=0){if(found||++visited>50000||depth>16)return;if(typeof v==='string'){if(!/^(?:href|url|path|uri|link)$/i.test(key))return;try{found=new URL(v,'https://www.dior.com').href===canonical;}catch{}return;}if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))if(!/secret|auth|token|session|tracking/i.test(k))visit(x,k,depth+1);}
 visit(p,'pageProps');return found?{canonical,country,url:'https://www.dior.com/_next/data/'+m[1]+u.pathname+'.json'}:null;
}

// Prices only: accept only the exact registered KR code, explicit local
// currency and canonical. Do not import foreign names, images or attributes.
export function diorForeignDataPrices(body,canonical,country,references,checkedAt){
 if(typeof body!=='string'||Buffer.byteLength(body)>8388608||!Number.isFinite(Date.parse(checkedAt)))throw Error('FOREIGN_SOURCE_BOUND');
 const locale=diorForeignLocales[country],currency={JP:'JPY',FR:'EUR',IT:'EUR',ES:'EUR',US:'USD',SG:'SGD',HK:'HKD'}[country],u=new URL(canonical);
 if(!locale||u.origin!=='https://www.dior.com'||!u.pathname.startsWith('/'+locale+'/fashion/')||u.search||u.hash)throw Error('FOREIGN_CANONICAL');
 let d;try{d=JSON.parse(body);}catch{throw Error('FOREIGN_DATA_NOT_JSON');}const props=d.pageProps;if(props?.locale!==locale)throw Error('FOREIGN_LOCALE_MISMATCH');
 const records=new Map();const add=(p,url)=>{let target;try{target=new URL(url,u);}catch{return;}const code=target.pathname.match(new RegExp('^/'+locale+'/fashion/products/([A-Z0-9]+_[A-Z0-9]+)$'))?.[1];if(target.origin!==u.origin||target.search||target.hash||!code||norm(p.code)!==norm(code)||!references.has(norm(code)))return;
  if(p.price?.currency!==currency||typeof p.price.value!=='number'||!Number.isFinite(p.price.value)||p.price.value<=0)return;
  const r={brand:'dior',country,currency,normalizedCode:norm(code),originalCode:code,officialUrl:target.href,price:p.price.value,priceStatus:'confirmed',checkedAt};const old=records.get(r.normalizedCode);if(old&&(old.price!==r.price||old.officialUrl!==r.officialUrl))throw Error('FOREIGN_PRICE_CONFLICT');records.set(r.normalizedCode,r);};
 if(props.product){const p=props.product,code=u.pathname.split('/').at(-1);if(norm(props.identifier)!==norm(code)||norm(p.code)!==norm(code)||norm(p.backendSku)!==norm(code))throw Error('FOREIGN_SKU_MISMATCH');add(p,canonical);
  if(Array.isArray(p.declinations)&&p.declinations.length<=1000)for(const option of p.declinations)if(norm(option.code)&&norm(option.code)===norm(option.backendSku)&&typeof option.uri==='string')add(option,option.uri);
 }
 else {const dict=props.queriesProductsDictionnary;if(!dict||typeof dict!=='object'||Array.isArray(dict)||Object.keys(dict).length>100)throw Error('FOREIGN_LIST_SCOPE');let count=0;for(const group of Object.values(dict))for(const p of group?.hits??[]){if(++count>10000)throw Error('FOREIGN_HIT_LIMIT');add(p,p.productLink?.uri);}}
 return [...records.values()];
}
