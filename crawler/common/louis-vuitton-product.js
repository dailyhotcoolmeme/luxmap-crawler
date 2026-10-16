import crypto from 'node:crypto';

export const normalizeLouisVuitton = value => String(value ?? '').trim().toUpperCase().replace(/[\s.-]/g, '');
export const decodeLouisVuitton = value => String(value ?? '').replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[\da-f]+|\d+);/gi, entity => {
 const named = {'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
 if(named[entity.toLowerCase()])return named[entity.toLowerCase()];
 const n=entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):parseInt(entity.slice(2,-1),10);
 return n<=0x10ffff?String.fromCodePoint(n):'';
});
export function louisVuittonUrl(value, cfg, base=cfg.entryUrl) {
 const u=new URL(decodeLouisVuitton(value),base);
 if(u.protocol!=='https:'||u.username||u.password||!cfg.allowedHosts.includes(u.hostname))throw Error('UNAUTHORIZED_URL');
 if(u.hostname!==new URL(cfg.entryUrl).hostname||!u.pathname.startsWith(cfg.localePrefix))throw Error('COUNTRY_MISMATCH');
 u.hash='';return u.href;
}
export function louisVuittonCode(url) {
 return decodeURIComponent(new URL(url).pathname).match(/(?:-|\/)([A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})(?:\.(?:html|htm))?\/?$/i)?.[1]?.toUpperCase()??null;
}
export const isLouisVuittonReference=value=>typeof value==='string'&&/^(?:[A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})$/.test(value);
export const louisVuittonFamilyUrl=url=>url.replace(/\/(?:[A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})\/?$/i,'').replace(/\/$/,'');
export function louisVuittonJson(html) {
 const output=[];let nodes=0;
 const visit=value=>{if(++nodes>50000)throw Error('METADATA_LIMIT');if(!value||typeof value!=='object')return;output.push(value);Object.values(value).forEach(visit);};
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  let data;try{data=JSON.parse(match[1]);}catch{try{data=JSON.parse(decodeLouisVuitton(match[1]));}catch{continue;}}visit(data);
 }return output;
}
export function louisVuittonLinks(html, base, cfg) {
 const urls=new Set();
 for(const m of html.matchAll(/\b(?:href|data-url)\s*=\s*["']([^"']+)["']/gi))try{urls.add(louisVuittonUrl(m[1],cfg,base));}catch(error){if(error.message==='UNAUTHORIZED_URL')continue;}
 for(const node of louisVuittonJson(html))for(const value of [node.url,node['@id']])if(typeof value==='string')try{urls.add(louisVuittonUrl(value,cfg,base));}catch{}
 return [...urls];
}
export function louisVuittonAccess(html,status=200) {
 if([401,403,429].includes(status)||/<title[^>]*>\s*(?:just a moment|access denied|attention required|security check)|(?:cf-chl|challenge-platform|px-captcha|geo\.captcha-delivery\.com|verify you are human)/i.test(html))throw Error('ACCESS_BLOCKED');
 const visible=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
 if(/\baccess\s+denied\b|\brequest\s+blocked\b|\baccess\s+to\s+this\b.{0,150}\bdenied\b/i.test(visible))throw Error('ACCESS_BLOCKED');
}
export function parseLouisVuittonProduct(html,url,cfg,expectedCode=null,{handbagEvidence=false}={}) {
 louisVuittonAccess(html);url=louisVuittonUrl(url,cfg);
 const code=louisVuittonCode(url);if(!code)throw Error('MANUFACTURER_REFERENCE_MISSING');
 if(expectedCode&&code!==normalizeLouisVuitton(expectedCode))throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 const products=louisVuittonJson(html).filter(n=>[n['@type']].flat().includes('Product'));
 if(!products.length)throw Error('PRODUCT_DATA_UNAVAILABLE');
 const exact=products.filter(p=>normalizeLouisVuitton(p.sku??p.mpn)===code);
 if(exact.length!==1)throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 const p=exact[0];if(p.mpn&&normalizeLouisVuitton(p.mpn)!==code)throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 if(p.url&&louisVuittonUrl(p.url,cfg,url)!==url)throw Error('PRODUCT_URL_MISMATCH');
 if(p.brand){const brand=typeof p.brand==='string'?p.brand:p.brand.name;if(brand&&!/^louis\s*vuitton$/i.test(brand.trim()))throw Error('BRAND_MISMATCH');}
 const category=String(p.category??'');
 if(!handbagEvidence&&!/\b(?:handbags?|shoulder bags?|tote bags?|crossbody bags?|clutch bags?)\b|핸드백|숄더백|토트백|크로스바디|클러치/i.test(category))throw Error('CLASSIFICATION_UNRESOLVED');
 const offers=[p.offers].flat().filter(Boolean);
 if(offers.some(o=>o.priceCurrency&&o.priceCurrency!==cfg.currency))throw Error('CURRENCY_MISMATCH');
 for(const offer of offers)if(offer.url&&louisVuittonUrl(offer.url,cfg,url)!==url)throw Error('PRODUCT_URL_MISMATCH');
 const prices=[...new Set(offers.filter(o=>o.priceCurrency===cfg.currency&&o.price!==undefined).map(o=>Number(String(o.price).replace(/,/g,''))))];
 if(prices.length>1||prices.some(v=>!Number.isFinite(v)||v<=0))throw Error('INVALID_PRICE');
 const price=prices[0]??null;
 const name=decodeLouisVuitton(p.name).replace(/\s+/g,' ').trim();if(!name||name.length>500)throw Error('PRODUCT_NAME_MISSING');
 const group=p.isVariantOf;
 // Explicit official group identity only; no inferred family names or translations.
 const groupId=typeof group==='object'?String(group.productGroupID??''):'';
 const family=typeof group==='object'&&group.name?String(group.name):name;
 const modelKey=groupId?`official-${groupId}`:`sku-${code}`;
 const scalar=v=>typeof v==='string'?decodeLouisVuitton(v).trim():null;
 const dimension=v=>{if(!v||typeof v!=='object')return null;const n=Number(v.value),unit=String(v.unitCode??v.unitText??'').toUpperCase();return Number.isFinite(n)&&n>0&&['MMT','MM','CMT','CM'].includes(unit)?n*(unit==='CM'||unit==='CMT'?10:1):null;};
 let sourceImageUrl=null;
 for(const image of [p.image].flat())if(image){const value=typeof image==='string'?image:image.contentUrl??image.url;try{const asset=new URL(value,url);if(asset.protocol==='https:'&&!asset.username&&!asset.password&&cfg.imageHosts.includes(asset.hostname)){sourceImageUrl=asset.href;break;}}catch{}}
 if(cfg.country==='KR'&&!sourceImageUrl)throw Error('ORIGINAL_IMAGE_SOURCE_MISSING');
 return {brand:cfg.brand,country:cfg.country,currency:cfg.currency,originalCode:String(p.sku??p.mpn),normalizedCode:code,sourceProductId:String(p.productID??code),styleCode:groupId||code,productName:name,parentModel:family,modelKey:`lv-${crypto.createHash('sha256').update(modelKey).digest('hex').slice(0,20)}`,colorOriginal:scalar(p.color),colorDisplay:scalar(p.color),materialOriginal:scalar(p.material),materialDisplay:scalar(p.material),widthMm:dimension(p.width),heightMm:dimension(p.height),depthMm:dimension(p.depth),description:scalar(p.description),sourceImageUrl:cfg.country==='KR'?sourceImageUrl:null,price,priceStatus:price===null?'price_unavailable':'confirmed',officialUrl:url,checkedAt:new Date().toISOString()};
}
