import {celineNodes} from './celine-html.js';
import {diorPageDataProduct} from './dior-page-data.js';
const code=u=>new URL(u).pathname.match(/^\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)$/)?.[1];
// Framework routing expansion, not a claim that each data URL was observed.
// Bind the published build + dynamic page + own query to a successful control
// and take target product paths only from literal anchors in this document.
export function diorPageDataRoutes(html,controlDataUrl,routingHtml=html){
 const control=new URL(controlDataUrl),m=control.pathname.match(/^\/_next\/data\/([A-Za-z0-9_-]{1,100})\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)\.json$/);
 if(control.origin!=='https://www.dior.com'||control.search||control.hash||!m||typeof html!=='string'||Buffer.byteLength(html)>8388608||typeof routingHtml!=='string'||Buffer.byteLength(routingHtml)>8388608)return [];
 const routeNodes=celineNodes(routingHtml),canonical=routeNodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');
 if(canonical.length!==1||!/^https:\/\/www\.dior\.com\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+$/.test(canonical[0].attrs.href))return [];
 const payloads=[...routingHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(v=>/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(v[1])&&/\btype\s*=\s*["']application\/json["']/i.test(v[1]));
 if(payloads.length!==1)return [];let d;try{d=JSON.parse(payloads[0][2]);}catch{return [];}
 const own=code(canonical[0].attrs.href),norm=v=>String(v??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 const props=d.props?.pageProps;
 if(d.buildId!==m[1]||d.gsp!==true||typeof d.page!=='string'||!d.page.endsWith('/products/[identifier]')||d.query?.locale!=='ko_kr'||norm(d.query.identifier)!==norm(own)||props?.locale!=='ko_kr'||norm(props?.identifier)!==norm(own))return [];
 let hrefs;
 if(/^\s*\{/.test(html)){
  let data;try{data=JSON.parse(html);}catch{return [];}const p=data?.pageProps?.product;
  if(!p||!diorPageDataProduct(html,'https://www.dior.com/ko_kr/fashion/products/'+p.code,p.code)||!Array.isArray(p.declinations)||p.declinations.length>1000)return [];
  hrefs=p.declinations.filter(x=>{try{const u=new URL(x.uri,'https://www.dior.com'),id=code(u.href);return !!id&&norm(x.code)===norm(id)&&norm(x.backendSku)===norm(id)&&x.price?.currency==='KRW'&&typeof x.title==='string'&&x.title.length>0;}catch{return false;}}).map(x=>x.uri);
 }else{
  const nodes=html===routingHtml?routeNodes:celineNodes(html),sourceCanonical=nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');
  if(sourceCanonical.length!==1||!/^https:\/\/www\.dior\.com\/ko_kr\/fashion\/[^?#]+$/.test(sourceCanonical[0].attrs.href))return [];
  hrefs=nodes.filter(n=>n.tag==='a'&&typeof n.attrs.href==='string').map(n=>n.attrs.href);
 }
 const result=new Map();
 for(const href of hrefs)try{
  const u=new URL(href,'https://www.dior.com'),id=code(u.href);
  if(u.origin!=='https://www.dior.com'||u.search||u.hash||u.username||u.password||!id)continue;
  result.set(u.href,{canonical:u.href,url:'https://www.dior.com/_next/data/'+m[1]+u.pathname+'.json'});
 }catch{}
 return [...result.values()];
}

// The caller must independently verify a PUBLIC_CATALOG_VERIFIED receipt for
// this literal canonical. This maps that proven product through the same
// published framework rule; it does not fabricate a source document/anchor.
export function diorPageDataRouteForReceipt(canonical,controlDataUrl,routingHtml){
 if(typeof canonical!=='string'||!/^https:\/\/www\.dior\.com\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+$/.test(canonical))return null;
 const bound='<link rel="canonical" href="'+canonical+'"><a href="'+canonical+'"></a>';
 return diorPageDataRoutes(bound,controlDataUrl,routingHtml)[0]??null;
}

export function diorStaticColorListingRoute(html,controlDataUrl,targetCanonical=null){
 const control=new URL(controlDataUrl),build=control.pathname.match(/^\/_next\/data\/([A-Za-z0-9_-]{1,100})\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+\.json$/)?.[1];
 if(control.origin!=='https://www.dior.com'||control.search||control.hash||!build||typeof html!=='string'||Buffer.byteLength(html)>8388608)return null;
 const canonical='https://www.dior.com/ko_kr/fashion/womens-fashion/bags/totes-bags',nodes=celineNodes(html).filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');if(nodes.length!==1||nodes[0].attrs.href!==canonical)return null;
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(m[1])&&/\btype\s*=\s*["']application\/json["']/i.test(m[1]));if(scripts.length!==1)return null;
 let d;try{d=JSON.parse(scripts[0][2]);}catch{return null;}
 if(d.buildId!==build||d.gsp!==true||d.page!=='/static/[device]/[locale]/[universe]/[[...path]]'||d.query?.locale!=='ko_kr'||d.query.universe!=='fashion'||!Array.isArray(d.query.path)||d.query.path.join('/')!=='womens-fashion/bags/totes-bags')return null;
 const target=targetCanonical??canonical;
 if(!/^https:\/\/www\.dior\.com\/ko_kr\/fashion\/(?:womens-fashion|mens-fashion)\/bags(?:\/[a-z0-9-]+)?$/.test(target))return null;
 if(target!==canonical&&!celineNodes(html).some(n=>{if(n.tag!=='a'||typeof n.attrs.href!=='string')return false;try{return new URL(n.attrs.href,'https://www.dior.com').href===target;}catch{return false;}}))return null;
 return {canonical:target,url:'https://www.dior.com/_next/data/'+build+new URL(target).pathname+'.json'};
}
