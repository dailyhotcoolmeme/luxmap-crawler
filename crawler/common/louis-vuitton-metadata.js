import {decodeLouisVuitton,isLouisVuittonReference,louisVuittonCode,louisVuittonFamilyUrl} from './louis-vuitton-product.js';
import {celineNodes} from './celine-html.js';
export function louisVuittonBagListFamilies(html,sourceUrl){
 const u=new URL(sourceUrl),families=new Set();if(u.origin!=='https://kr.louisvuitton.com'||!/^\/kor-kr\/(?:women\/handbags|men\/bags)\//.test(u.pathname)||/\/[^/]*accessories\//.test(u.pathname))return families;
 for(const n of celineNodes(html)){if(n.tag!=='a'||!n.attrs.href)continue;let p=n,card=false,grid=false,recommendation=false;
  while(p){const c=p.attrs.class??'';card||=/(?:^|\s)lv-product-card[\w-]*(?:\s|$)/.test(c);grid||=/\blv-(?:product-list|product-listing|plp|product-grid)(?:__|\s|$)/.test(c);recommendation||=/recommend|recently-viewed|carousel|cross-sell/i.test(c);p=p.parent;}
  if(!card||!grid||recommendation)continue;try{const target=new URL(decodeLouisVuitton(n.attrs.href),u.href);if(target.origin===u.origin&&target.pathname.startsWith('/kor-kr/products/')&&louisVuittonCode(target.href))families.add(louisVuittonFamilyUrl(target.href));}catch{}
 }return families;
}
export function mergeLouisVuittonPriceCard(cards,conflicts,item){
 if(conflicts.has(item.code))return;
 const prior=cards.get(item.code);
 if(prior&&prior.price!==item.price){conflicts.add(item.code);cards.delete(item.code);return;}
 cards.set(item.code,item);
}
export function cleanLouisVuittonName(value){
 const name=decodeLouisVuitton(value).replace(/[®Ⓡ]/g,'').replace(/<[^>]*>/g,' ').replace(/[（(]\s*(?:앞면|뒷면|측면|옆면|정면|후면|디테일|착용|front(?:\s+view)?|back(?:\s+view)?|side(?:\s+view)?)\s*[)）]/gi,' ').replace(/louis\s+vuitton/gi,' ').replace(/루이\s*비통/g,' ').replace(/(?:핸드백|가방)\s*전체\s*보기/g,' ').replace(/(?:[|｜·:–—-]\s*){2,}/g,' ').replace(/^[\s|｜·:–—-]+|[\s|｜·:–—-]+$/g,'').replace(/\s+/g,' ').trim();
 if(!name||name.length>300||/(?:핸드백|가방)\s*전체\s*보기|louis\s+vuitton/i.test(name))throw Error('PRODUCT_NAME_UNRESOLVED');return name;
}
export function louisVuittonDescriptionFields(value){
 if(typeof value!=='string'||value.length>100000)return {};
 const text=decodeLouisVuitton(value).replace(/<\s*(?:br\s*\/?|\/(?:li|p|div))\s*>/gi,'\n').replace(/<[^>]*>/g,' ').replace(/\r/g,''),lines=text.split('\n').map(s=>s.replace(/^\s*[-•·]\s*/,'').replace(/\s+/g,' ').trim()).filter(Boolean),out={};
 const labeled=(labels)=>{const matches=lines.map(s=>s.match(new RegExp('^(?:'+labels+')\\s*[:：]\\s*(.{1,150})$','i'))?.[1]).filter(Boolean);return new Set(matches).size===1?matches[0]:undefined;};
 out.color=labeled('색상|컬러|colou?r');out.material=labeled('소재|material');
 const dim=text.match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm)\s*\(?\s*(?:길이|너비|width|length)\s*[x×]\s*(?:높이|height)\s*[x×]\s*(?:너비|폭|깊이|depth)/i);
 if(dim){const factor=dim[4].toLowerCase()==='cm'?10:1;[out.widthMm,out.heightMm,out.depthMm]=dim.slice(1,4).map(n=>Number(n.replace(',','.'))*factor);}
 if(!out.material){const materials=lines.filter(s=>s.length<180&&/(?:캔버스|카우하이드|소가죽|양가죽|송아지\s*가죽|calfskin|cowhide|canvas|lambskin)/i.test(s)&&!/(?:안감|트리밍|스트랩|핸들|lining|trim|strap|handle)/i.test(s));if(new Set(materials).size===1)out.material=materials[0];}
 return Object.fromEntries(Object.entries(out).filter(([,v])=>v!==undefined));
}

// Search only data owned by a single explicit SKU. Never borrow attributes
// from a sibling colour/size variant or from page-wide metadata.
export function louisVuittonBoundFields(object,code){
 const texts=[],labeled=[],seen=new WeakSet();let nodes=0,conflict=false;
 function walk(v,depth=0){if(depth>8||++nodes>4000)return;if(typeof v==='string'){if(v.length<100000)texts.push(v);return;}if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);
  const label=v.label??v.title??v.name??v.key,content=v.value??v.text??v.displayValue;
  if(typeof label==='string'&&typeof content==='string'&&/^(?:색상|컬러|color|colour|소재|material)$/i.test(label.trim()))labeled.push(label+': '+content);
  for(const [k,item] of Object.entries(v)){if(/sku|mpn|product.*id|identifier|^id$|code/i.test(k)&&isLouisVuittonReference(item)&&item!==code)conflict=true;if(/^(?:색상|컬러|소재)$/i.test(k)&&typeof item==='string')labeled.push(k+': '+item);walk(item,depth+1);}
 }walk(object);if(conflict)return {};
 const fields=[...texts,...labeled].map(louisVuittonDescriptionFields),out={};
 for(const key of ['color','material','widthMm','heightMm','depthMm']){const values=[...new Set(fields.map(f=>f[key]).filter(v=>v!==undefined))];if(values.length===1)out[key]=values[0];}
 return out;
}

export function louisVuittonDimensions(value){
 const unit=String(value?.unitText??value?.unitCode??'').trim().toLowerCase(),factor=['cm','cmt','centimeter','centimeters','centimetre','centimetres'].includes(unit)?10:['mm','mmt'].includes(unit)?1:['in','inh','inch','inches'].includes(unit)?25.4:null;
 if(!factor||!value?.values||Array.isArray(value.values))return {};
 const out={};for(const axis of ['width','height','depth']){const raw=value.values[axis];if(!['number','string'].includes(typeof raw)||!/^\d+(?:\.\d+)?$/.test(String(raw)))return {};const n=Number(raw)*factor;if(!Number.isFinite(n)||n<=0)return {};out[axis+'Mm']=Number(n.toFixed(3));}
 return out;
}

export function selectLouisVuittonAttribute(fields,key){
 let observed=fields.filter(f=>f[key]!==undefined&&f[key]!==null);
 if(observed.some(f=>(f.sourceCountry??'KR')==='KR'))observed=observed.filter(f=>(f.sourceCountry??'KR')==='KR');
 if(key==='material'&&observed.some(f=>f.materialEvidence==='direct'))observed=observed.filter(f=>f.materialEvidence==='direct');
 const time=Math.max(...observed.map(f=>Date.parse(f.sourceCheckedAt)));if(Number.isFinite(time))observed=observed.filter(f=>Date.parse(f.sourceCheckedAt)===time);
 const values=[...new Set(observed.map(f=>f[key]))];return values.length>1?{conflict:true}:values.length?{value:values[0]}:{};
}
