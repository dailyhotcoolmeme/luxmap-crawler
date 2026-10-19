import {celineNodes,celineText} from './celine-html.js';
import {diorDetailAttributes,diorSubtitleAttributes} from './dior-detail-attributes.js';

const normalize=v=>String(v??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
const escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// A literal shade prefix from this product's subtitle corroborated by this
// same product's explicit "X 컬러/색상" statement. Do not infer a color from
// general marketing words, the title, a picture, or a product-code suffix.
export function diorExplicitDescribedColor(subtitle,description){
 if(typeof subtitle!=='string'||subtitle.length>300||typeof description!=='string'||description.length>20000||/<(?:script|style|iframe)\b/i.test(description))return null;
 const root=celineNodes('<main>'+description+'</main>').find(n=>n.tag==='main');if(!root)return null;const text=celineText(root).replace(/\s+/g,' ').trim(),words=subtitle.trim().split(/\s+/);
 for(let n=Math.min(words.length,8);n>=1;n--){
  const prefix=words.slice(0,n).join(' ');if(prefix.length>50||!/^[가-힣A-Za-z &/·-]+$/.test(prefix)||/자수|장식|프린트|메탈|피니시|트리밍|안감|디올|Dior|까나쥬|캐니지|자카드|캔버스|가죽|램스킨|패브릭|소재/i.test(prefix))continue;
  const literal=prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),m=text.match(new RegExp('(?:^|[\\s,.!?。])'+literal+'\\s+(?:컬러|색상)(?=\\s|[의로와을가를])'));
  if(!m)continue;const after=text.slice(m.index+m[0].length,m.index+m[0].length+24);if(/^(?:의|로|와|을|가|를)?\s*(?:메탈|피니시|트리밍|안감|스트랩|금속|스티치)/.test(after))continue;return prefix;
 }
 return null;
}

export function diorPageDataSubtitleColor(value,explicitMaterial=false){
 const prefix=diorSubtitleAttributes(value).color;
 if(prefix&&!/\s*(?:&|및)\s*/.test(value))return prefix;
 if(typeof value!=='string'||value.length>300||/[<>\x00-\x1f]/.test(value)||/피니시|메탈|스티치|트리밍|안감/.test(value)||!explicitMaterial&&!/(?:가죽|램스킨|자카드|캔버스|라피아|패브릭|새틴|시어링|코튼)/.test(value))return null;
 const labeled=value.trim().match(/^([가-힣A-Za-z &/·-]{1,40}?)\s+(?:컬러|색상)(?:\s|$)/);
 if(labeled&&!/Dior|까나쥬|캐니지|자카드|캔버스|가죽|램스킨|패브릭|소재|프린트|장식|메탈|피니시|트리밍|안감/i.test(labeled[1]))return labeled[1].trim()==='멀티'?labeled[0].trim():labeled[1].trim();
 // An unambiguous literal color inside the self product's descriptor, not
 // the product title/description. Accent/hardware and multi-color ambiguity
 // are rejected. Keep the exact published words, never a SKU interpretation.
 const colors='블랙|오프화이트|화이트|블루|핑크|베이지|브라운|그레이|그린|레드|아이보리|라떼|에크루|옐로우|버건디|누드|토프|네이비|카키|오렌지|실버|골드|멀티컬러|크림|초콜릿|코냑|퍼플|바이올렛';
 const token='(?:(?:라이트|다크|페일|딥|미오소티스|트리아농|네이비)\\s*)?(?:'+colors+')';
 // "black leather & white canvas" joins material components, not a
 // contiguous color list. Require every component to name its own leading
 // color and material; never silently discard an unknown component.
 const components=value.split(/[（(]/,1)[0].trim().split(/\s*(?:&|및)\s*/);
 if(explicitMaterial&&components.length>=2&&components.length<=4&&components.every(part=>/(?:가죽|램스킨|자카드|캔버스|라피아|패브릭|새틴|시어링|코튼)/.test(part))){
  const heads=components.map(part=>part.match(new RegExp('^('+token+')(?=\\s)'))?.[1]??null);
  return heads.every(Boolean)?[...new Set(heads)].join(' / '):null;
 }
 if(prefix)return prefix;
 const matches=[...value.matchAll(new RegExp('(?:^|\\s)('+token+'(?:\\s*(?:/|&|및)\\s*'+token+')*)(?=\\s|$)','g'))];
 if(matches.some(m=>/[&/]\s*$/.test(value.slice(0,m.index))||/^\s*(?:&|\/|및)(?:\s|$)/.test(value.slice(m.index+m[0].length))))return null;
 const unique=[...new Set(matches.map(m=>m[1]))];return unique.length===1?unique[0]:null;
}

// Only the self product in the actual published Next page payload. Never walk
// tracking, recommendations, accounts, variations or arbitrary JSON objects.
export function diorPageDataProduct(source,url,expectedCode){
 if(typeof source!=='string'||Buffer.byteLength(source)>8388608)throw Error('PAGE_DATA_BOUND');
 const u=new URL(url),match=u.pathname.match(/^\/ko_kr\/fashion\/products\/([A-Z0-9]+_[A-Z0-9]+)$/);
 if(u.origin!=='https://www.dior.com'||u.search||u.hash||!match||normalize(match[1])!==normalize(expectedCode))return null;
 const docs=[];
 if(/^\s*\{/.test(source)){try{docs.push(JSON.parse(source));}catch{throw Error('PAGE_DATA_JSON_INVALID');}}
 else{
  const canonical=celineNodes(source).filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');
  if(canonical.length!==1||canonical[0].attrs.href!==url)return null;
  for(const m of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(!/\bid\s*=\s*["']__NEXT_DATA__["']/i.test(m[1])||!/\btype\s*=\s*["']application\/json["']/i.test(m[1]))continue;
   try{docs.push(JSON.parse(m[2]));}catch{throw Error('PAGE_DATA_JSON_INVALID');}
  }
 }
 const candidates=docs.map(d=>d?.pageProps?d:{pageProps:d?.props?.pageProps}).filter(d=>d?.pageProps?.product);
 if(!candidates.length)return null;if(candidates.length!==1)throw Error('PAGE_DATA_CONFLICT');
 const props=candidates[0].pageProps,p=props.product,code=normalize(expectedCode);
 if(String(props.locale??'').replace('-','_').toLowerCase()!=='ko_kr')throw Error('PAGE_DATA_COUNTRY_MISMATCH');
 if(normalize(props.identifier)!==code||normalize(p.code)!==code||normalize(p.backendSku)!==code)throw Error('PAGE_DATA_SKU_MISMATCH');
 if(typeof p.title!=='string'||!p.title.trim()||p.title.length>500)throw Error('PAGE_DATA_TITLE_MISSING');
 if(p.price?.currency!=='KRW'||typeof p.price.value!=='number'||!Number.isFinite(p.price.value)||p.price.value<=0)throw Error('PAGE_DATA_PRICE_INVALID');
 const texts=[];
 if(Array.isArray(p.characteristics)&&p.characteristics.length<=100)for(const value of p.characteristics)if(typeof value==='string'&&value.length<=2000)texts.push(...value.split(/\r?\n/));
 if(typeof p.sizeAndFit==='string'&&p.sizeAndFit.length<=10000)texts.push(...p.sizeAndFit.split(/\r?\n/));
 const labels='<link rel="canonical" href="'+escape(url)+'"><main data-sku="'+code+'">'+texts.map(v=>'<p>'+escape(v)+'</p>').join('')+'</main>';
 const details=diorDetailAttributes(labels,url,code),subtitle=diorSubtitleAttributes(p.subtitle);
 const images=[];let visited=0;
 function scan(v,depth=0){
  if(++visited>3000||depth>10)throw Error('PAGE_IMAGE_BOUND');
  if(typeof v==='string'){try{const asset=new URL(v,url),id=asset.pathname.match(/^\/is\/image\/diorprod\/([A-Z0-9]+)(?:_SBG)?_E\d{2}(?:-\d+)?$/)?.[1];if(asset.protocol==='https:'&&asset.hostname==='assets.christiandior.com'&&!asset.username&&!asset.password&&id===code&&!images.includes(asset.href))images.push(asset.href);}catch{}return;}
  if(v&&typeof v==='object')for(const child of Object.values(v))scan(child,depth+1);
 }
 // A transparent own-product view comes first; no cross-sell/variant images.
 scan(p.views?.transparent);scan(p.views);scan(p.medias);
 return {'@type':'Product',sku:p.code,productID:String(p.sku??p.code),name:p.title,url,category:'Handbags',image:images.slice(0,8),color:diorPageDataSubtitleColor(p.subtitle,Boolean(details.material))??diorExplicitDescribedColor(p.subtitle,p.description),material:details.material??subtitle.material??null,
  width:details.widthMm?{value:details.widthMm,unitCode:'MMT'}:null,height:details.heightMm?{value:details.heightMm,unitCode:'MMT'}:null,depth:details.depthMm?{value:details.depthMm,unitCode:'MMT'}:null,
  description:typeof p.description==='string'?p.description:null,offers:{price:p.price.value,priceCurrency:'KRW',url}};
}
