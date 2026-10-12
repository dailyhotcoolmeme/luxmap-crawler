import { normalizeProductCode } from './product-normalizer.js';

export const decodeHtml = value => String(value ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(parseInt(n,16)));
// Korean official names only; never infer a category from the source URL slug.
export const isPradaBag = name => /(가방|핸드백|토트|쇼퍼|호보|클러치|백팩|백)/i.test(name ?? '') && !/(백\s*참|백\s*장식|스트랩|티셔츠|재킷|슬링백|펌프스|샌들|로퍼|스니커즈|부츠)/i.test(name ?? '');
export function productLinks(html, base, country) {
  const links=new Map();
  for(const match of html.matchAll(/href=["']([^"']+)["']/gi)){
    let url;try{url=new URL(decodeHtml(match[1]),base);}catch{continue;}
    const code=decodeURIComponent(url.pathname.split('/').at(-1));
    if(url.origin!=='https://www.prada.com'||!url.pathname.startsWith(`/${country}/`)||!url.pathname.includes('/p/')||!/^\d[A-Z]{2}\d{3}_[A-Z0-9]+_F[A-Z0-9]+(?:_V_[A-Z0-9]+)?$/i.test(code))continue;
    url.search='';url.hash='';links.set(normalizeProductCode(code),url.href);
  }
  return links;
}
export function pradaModelProductLinks(model,base,country){
 const links=new Map();const visit=(value,key='')=>{if(/stock|inventory|availability/i.test(key))return;if(typeof value==='string'){for(const[code,url]of productLinks(value,base,country))links.set(code,url);try{const url=new URL(decodeHtml(value),base);if(url.origin==='https://www.prada.com'&&url.pathname.startsWith(`/${country}/`)&&url.pathname.includes('/p/')){const code=decodeURIComponent(url.pathname.split('/').at(-1));if(/^\d[A-Z]{2}\d{3}_[A-Z0-9]+_F[A-Z0-9]+(?:_V_[A-Z0-9]+)?$/i.test(code)){url.search='';url.hash='';links.set(normalizeProductCode(code),url.href);}}}catch{}if(/^[\[{]/.test(value))try{visit(JSON.parse(value),key);}catch{}return;}if(value&&typeof value==='object')for(const[k,v]of Object.entries(value))visit(v,k);};visit(model);return links;
}
export function parsePradaProduct(html, url, config, modelMap, {requireImage=true}={}) {
  const originalCode=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
  const normalizedCode=normalizeProductCode(originalCode);
  const nodes=[],breadcrumbs=[];
  const visit=value=>{if(!value||typeof value!=='object')return;if([value['@type']].flat().includes('Product'))nodes.push(value);if([value['@type']].flat().includes('BreadcrumbList'))breadcrumbs.push(value);for(const child of Object.values(value))if(child&&typeof child==='object')visit(child);};
  for(const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(match[1]));}catch{try{visit(JSON.parse(decodeHtml(match[1]).trim().replace(/^<!--\s*|\s*-->$/g,'')));}catch{}}}
  const product=nodes.find(node=>normalizeProductCode(node.sku??node.productID)===normalizedCode);
  if(!product||!product.name)throw Object.assign(new Error('exact product missing'),{failureCode:'EXACT_PRODUCT_MISSING',observedCode:nodes.map(node=>normalizeProductCode(node.sku??node.productID)).find(code=>code!==normalizedCode&&/^\d[A-Z]{2}\d{3}[A-Z0-9]+$/.test(code))});
  const offers=[product.offers].flat().filter(Boolean);
  let offer=offers.find(item=>item?.priceCurrency===config.currency);
  if(!offer&&offers.some(item=>item.price!=null&&item.priceCurrency))throw Object.assign(new Error('country currency mismatch'),{failureCode:'CURRENCY_MISMATCH'});
  if(!offer&&config.referenceDetailPrefix)offer=offers.find(item=>{if(item.priceCurrency||item.price==null||!item.url)return false;try{const source=new URL(decodeHtml(item.url),url);return source.origin==='https://www.prada.com'&&source.pathname.startsWith(config.referenceDetailPrefix)&&normalizeProductCode(decodeURIComponent(source.pathname.split('/').at(-1)))===normalizedCode;}catch{return false;}});
  const price=offer?.price==null?null:Number(String(offer.price).replace(/,/g,''));
  if(price!==null&&(!Number.isFinite(price)||price<=0))throw Object.assign(new Error('price invalid'),{failureCode:'INVALID_PRICE'});
  const name=decodeHtml(product.name);
  const family=modelMap.find(rule=>new RegExp(rule.pattern,'iu').test(name));
  const styleCode=originalCode.split('_')[0];
  const text=decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
  const dimension=label=>{const match=text.match(new RegExp(`${label}\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)\\s*cm`,'i'));return match?Number(match[1].replace(',','.'))*10:null;};
  let color=typeof product.color==='string'?product.color:null;
  for(const match of html.matchAll(/<img\b[^>]*>/gi)){
    const tag=decodeHtml(match[0]),alt=tag.match(/alt=["']([^"']+)["']/i)?.[1];
    if(!alt||!tag.includes(originalCode))continue;
    const remainder=alt.replace(name,'').replace(/^[\s,·|:-]+|[\s,·|:-]+$/g,'').trim();
    if(remainder&&remainder.length<=35&&/[가-힣]/.test(remainder))color=remainder;
  }
  for(const match of html.matchAll(/<a\b([^>]*href=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi)){
    const href=match[1].match(/href=["']([^"']+)["']/i)?.[1];
    try{if(normalizeProductCode(decodeURIComponent(new URL(decodeHtml(href),url).pathname.split('/').at(-1)))!==normalizedCode)continue;}catch{continue;}
    const label=match[1].match(/(?:aria-label|title|data-color-name)=["']([^"']+)["']/i)?.[1];
    if(label&&label.length<60&&!label.includes(name))color=decodeHtml(label);
  }
  if(!color){const match=text.match(/(?:색상|컬러)\s*[:：]\s*([^:：]{1,35}?)(?:제품|크기|사이즈|소재|높이|너비|폭|$)/);color=match?.[1]?.trim()??null;}
  const material=typeof product.material==='string'?product.material:name.match(/사피아노 가죽|소프트 그레인 가죽|나파 가죽|송아지 가죽|가죽|리나일론|Re-Nylon|스웨이드|캔버스|라피아|데님/i)?.[0]??null;
  const image=[product.image].flat()[0];const imageUrl=typeof image==='string'?new URL(decodeHtml(image),url).href:image?.url;
  if(requireImage&&(!imageUrl||new URL(imageUrl).origin!=='https://www.prada.com'))throw Object.assign(new Error('reviewed image host required'),{failureCode:'IMAGE_HOST_UNREVIEWED'});
  const officialCategories=[product.category].flat().map(value=>typeof value==='string'?value:value?.name).filter(value=>typeof value==='string');
  const itemUrl=item=>typeof item.item==='string'?item.item:(item.item?.['@id']??item.item?.url??item.url);
  const trail=breadcrumbs.find(list=>Array.isArray(list.itemListElement)&&list.itemListElement.some(item=>{try{const target=new URL(itemUrl(item),url);return target.origin==='https://www.prada.com'&&target.pathname.startsWith(config.referenceDetailPrefix??'/kr/ko/p/')&&normalizeProductCode(decodeURIComponent(target.pathname.split('/').at(-1)))===normalizedCode;}catch{return false;}}));
  if(trail)for(const item of trail.itemListElement){try{const target=new URL(itemUrl(item),url);if(target.origin!=='https://www.prada.com')continue;if(config.listingUrls?.includes(target.href))officialCategories.push('Bags');if(/^\/kr\/ko\/(womens|mens)\/shoes\/c\/\d+KR$/.test(target.pathname))officialCategories.push('Footwear');if(/^\/kr\/ko\/(womens|mens)\/ready_to_wear\/c\/\d+KR$/.test(target.pathname))officialCategories.push('Clothing');}catch{}}
  return {originalCode,normalizedCode,styleCode,productName:name,officialCategories,parentModel:family?.name??`${name} · ${styleCode}`,modelKey:family?.key??`unreviewed-${styleCode.toLowerCase()}`,materialDisplay:material,materialOriginal:material,colorDisplay:color,colorOriginal:color,widthMm:dimension('(?:너비|폭)'),heightMm:dimension('높이'),depthMm:dimension('(?:깊이|길이)'),sourceImageUrl:imageUrl,price,priceStatus:price===null?'price_unavailable':'confirmed',officialUrl:url,country:config.country,currency:config.currency,checkedAt:new Date().toISOString()};
}

export function pradaSupplement(model, row) {
  const output={codes:new Set(),color:null,material:null,widthMm:null,heightMm:null,depthMm:null};
  const detailText=[];
  const collectOptionCodes=value=>{
    if(typeof value==='string'){for(const code of decodeHtml(value).match(/\d[A-Z]{2}\d{3}[_-][A-Z0-9]+[_-]F[A-Z0-9]+(?:[_-]V[_-][A-Z0-9]+)?/gi)??[])output.codes.add(code.replaceAll('-','_'));return;}
    if(value&&typeof value==='object')for(const[key,item]of Object.entries(value))if(!/stock|inventory|availability/i.test(key)){collectOptionCodes(key);collectOptionCodes(item);}
  };
  const visit=(value,field='')=>{
    if(/^sizePickerJSON$/i.test(field))collectOptionCodes(value);
    if(typeof value==='string'){
      if(/^[\[{]/.test(value)){try{visit(JSON.parse(value),field);}catch{}}
      if(/description|detail/i.test(field))detailText.push(decodeHtml(value.replace(/<[^>]+>/g,' ')));
      return;
    }
    if(!value||typeof value!=='object')return;
    const exact=Object.values(value).some(item=>typeof item==='string'&&normalizeProductCode(item)===row.normalizedCode);
    if(exact){for(const [key,item]of Object.entries(value)){if(typeof item==='string'&&/[가-힣]/.test(item)&&item.length<=45){if(/^(color|colour|colorName|colourName)$/i.test(key))output.color=item;if(/^material(?:Name)?$/i.test(key))output.material=item;}}}
    for(const [key,item]of Object.entries(value))if(!/stock|inventory|availability/i.test(key))visit(item,key);
  };
  visit(model);
  const text=detailText.join(' ').replace(/\s+/g,' ');
  for(const [key,label]of [['widthMm','(?:너비|폭)'],['heightMm','높이'],['depthMm','깊이']]){const match=text.match(new RegExp(`${label}\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)\\s*cm`,'i'));if(match)output[key]=Number(match[1].replace(',','.'))*10;}
  return output;
}
