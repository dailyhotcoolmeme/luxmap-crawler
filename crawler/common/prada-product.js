import { normalizeProductCode } from './product-normalizer.js';

export const decodeHtml = value => String(value ?? '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/gi, (_, n) => String.fromCodePoint(parseInt(n,16)));
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
export function parsePradaProduct(html, url, config, modelMap) {
  const originalCode=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
  const normalizedCode=normalizeProductCode(originalCode);
  const nodes=[];
  const visit=value=>{if(!value||typeof value!=='object')return;if([value['@type']].flat().includes('Product'))nodes.push(value);for(const child of Object.values(value))if(child&&typeof child==='object')visit(child);};
  for(const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{visit(JSON.parse(match[1]));}catch{}}
  const product=nodes.find(node=>normalizeProductCode(node.sku??node.productID)===normalizedCode);
  if(!product||!product.name)throw Object.assign(new Error('exact product missing'),{failureCode:'EXACT_PRODUCT_MISSING'});
  const offers=[product.offers].flat().filter(Boolean);
  const offer=offers.find(item=>item?.priceCurrency===config.currency);
  if(!offer&&offers.some(item=>item.price!=null&&item.priceCurrency))throw Object.assign(new Error('country currency mismatch'),{failureCode:'CURRENCY_MISMATCH'});
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
  if(!imageUrl||new URL(imageUrl).origin!=='https://www.prada.com')throw Object.assign(new Error('reviewed image host required'),{failureCode:'IMAGE_HOST_UNREVIEWED'});
  return {originalCode,normalizedCode,styleCode,productName:name,parentModel:family?.name??`${name} · ${styleCode}`,modelKey:family?.key??`unreviewed-${styleCode.toLowerCase()}`,materialDisplay:material,materialOriginal:material,colorDisplay:color,colorOriginal:color,widthMm:dimension('(?:너비|폭)'),heightMm:dimension('높이'),depthMm:dimension('(?:깊이|길이)'),sourceImageUrl:imageUrl,price,priceStatus:price===null?'price_unavailable':'confirmed',officialUrl:url,country:config.country,currency:config.currency,checkedAt:new Date().toISOString()};
}

export function pradaSupplement(model, row) {
  const output={codes:new Set(),color:null,material:null,widthMm:null,heightMm:null,depthMm:null};
  const detailText=[];
  const visit=(value,field='')=>{
    if(typeof value==='string'){
      if(field==='sizePickerJSON')for(const code of value.match(/\d[A-Z]{2}\d{3}_[A-Z0-9]+_F[A-Z0-9]+(?:_V_[A-Z0-9]+)?/g)??[])output.codes.add(code);
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
