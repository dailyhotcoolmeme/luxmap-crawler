import {celineNodes,celineText} from './celine-html.js';

// Only the SKU-bound product-card subtitle, never the product name, a page
// keyword/filter, an image, or free-form marketing copy. Keep literal wording.
export function diorSubtitleAttributes(value){
 if(typeof value!=='string'||value.length>300||/[<>\x00-\x1f]/.test(value))return {};
 const colors='블랙|오프화이트|화이트|블루|핑크|베이지|브라운|그레이|그린|레드|아이보리|라떼|에크루|옐로우|버건디|누드|토프|네이비|카키|오렌지|실버|골드';
 // Additional literal KR shade qualifiers observed on exact product headers.
 const token='(?:(?:라이트|다크|페일|딥|미오소티스|트리아농|네이비)\\s*)?(?:'+colors+')';
 const match=value.trim().match(new RegExp('^('+token+'(?:\\s*(?:/|&|및)\\s*'+token+')*)(?:\\s+|$)(.*)$'));
 if(!match||/^(?:및|와|과|앤)(?:\s|$)/.test(match[2])||new RegExp('^'+token+'(?:\\s|$)').test(match[2]))return {};
 const remainder=match[2].replace(/^컬러\s+/,'').trim();
 if(new RegExp('^'+token+'(?:\\s|$)').test(remainder))return {};
 const material=/(?:송아지\s*가죽|램스킨|양가죽|소가죽|가죽|캔버스|자카드|라피아|패브릭|새틴|실크|시어링|코튼)$/;
 return {color:match[1],...(remainder&&remainder.length<=160&&material.test(remainder)?{material:remainder}:{})};
}

// Verbatim, labeled specifications on the exact canonical KR product page.
// Never infer attributes from names, pictures, SKU suffixes or neighboring cards.
export function diorDetailAttributes(html,url,code,exactProductName=null){
 const normalize=s=>String(s??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 let target;try{target=new URL(url);}catch{return {};}
 if(target.origin!=='https://www.dior.com'||!/^\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+$/.test(target.pathname)||target.search||normalize(target.pathname.split('/').at(-1))!==normalize(code))return {};
 const nodes=celineNodes(html),canonical=nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical').map(n=>n.attrs.href);
 if(canonical.length!==1||canonical[0]!==target.href)return {};
 const excluded=n=>{for(let p=n;p;p=p.parent){if(['header','footer','nav','aside'].includes(p.tag)||/recommend|related|cross-sell|recently|carousel/i.test(p.attrs.class??''))return true;for(const key of ['data-product-id','data-sku'])if(p.attrs[key]&&normalize(p.attrs[key])!==normalize(code))return true;}return false;};
 const textOf=n=>celineText(n).replace(/&(?:nbsp|#160|#x0*a0);/gi,' ').replace(/\s+/g,' ').trim();
 const materials=new Set(),dimensions=new Map(),colors=new Set();
 const explicitAxes=text=>{
  const m=text.match(/^(?:크기|치수|dimensions)\s*[:：]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm)\s*\(\s*(길이|높이|너비|깊이|폭|가로|세로|length|height|width|depth)\s*[x×]\s*(길이|높이|너비|깊이|폭|가로|세로|length|height|width|depth)\s*[x×]\s*(길이|높이|너비|깊이|폭|가로|세로|length|height|width|depth)\s*\)(.*)$/i);
  if(!m||m[8].trim()&&!/^(?:[•·,;]|무게|중량|용량|기내|볼륨|weight|capacity)/i.test(m[8].trim()))return null;
  const axes=m.slice(5,8).map(x=>x.toLowerCase()),hasLength=axes.some(x=>['길이','length','가로'].includes(x)),keys=axes.map(x=>['높이','세로','height'].includes(x)?'heightMm':['깊이','폭','depth'].includes(x)?'depthMm':x==='너비'?(hasLength?'depthMm':'widthMm'):'widthMm');
  if(new Set(keys).size!==3)return null;const values=m.slice(1,4).map(v=>Number(v)*(m[4].toLowerCase()==='cm'?10:1));if(!values.every(v=>v>0&&v<=10000))return null;return Object.fromEntries(keys.map((k,i)=>[k,values[i]]));
 };
 const material=/^(?:(?:(?:주요|메인)\s*)?소재|material)\s*[:：]\s*(.{1,160})$/i;
 const metric=/^(?:크기|치수|dimensions)\s*[:：]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm)(?:\s*\/\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*인치)?\s*\(\s*(?:바닥부\s+)?(?:길이|가로|length)\s*[x×]\s*(?:높이|세로|height)\s*[x×]\s*(?:너비|폭|width|depth)\s*\)\s*$/i;
 for(const n of nodes){
  if(!['li','p','dd','div','span'].includes(n.tag)||excluded(n))continue;
  const text=textOf(n),m=text.match(material),d=text.match(metric);
  const axes=explicitAxes(text);if(axes)dimensions.set([axes.widthMm,axes.heightMm,axes.depthMm].join('|'),axes);
  if(m&&!/[<>]|(?:색상|컬러|크기|치수|소재|material|dimensions)\s*[:：]/i.test(m[1]))materials.add(m[1].trim());
  if(d){const scale=d[4].toLowerCase()==='cm'?10:1,values=d.slice(1,4).map(v=>Number(v)*scale);if(values.every(v=>Number.isFinite(v)&&v>0&&v<=10000))dimensions.set(values.join('|'),{widthMm:values[0],heightMm:values[1],depthMm:values[2]});}
 }
 // The observed KR detail header publishes its own color/material subtitle
 // in a labeled typography h2 beside an h1 with the exact Product name.
 // Do not use page titles, free text, another product or arbitrary h2 nodes.
 if(typeof exactProductName==='string'&&exactProductName.trim())for(const n of nodes){
  if(n.tag!=='h2'||excluded(n)||!/(?:^|\s)MuiTypography-label-m-regular(?:\s|$)/.test(n.attrs.class??''))continue;
  const attrs=diorSubtitleAttributes(textOf(n));if(!attrs.color)continue;
  let own=false;
  for(let p=n.parent,level=0;p&&level<2;p=p.parent,level++)if(!excluded(p)&&nodes.some(h=>h.tag==='h1'&&h.parent===p&&textOf(h)===exactProductName.trim()))own=true;
  if(own)colors.add(attrs.color);
 }
 return {...(colors.size===1?{color:[...colors][0]}:{}),...(materials.size===1?{material:[...materials][0]}:{}),...(dimensions.size===1?[...dimensions.values()][0]:{})};
}
export function diorMissingAttributePatch(existing,source){
 const patch={};
 if(source.color&&existing.color_ko===null&&existing.color_original===null){patch.color_ko=source.color;patch.color_original=source.colorOriginal??source.color;}
 if(source.material&&existing.material_ko===null&&existing.material_original===null){patch.material_ko=source.material;patch.material_original=source.material;}
 const dims=[['width_mm','widthMm'],['height_mm','heightMm'],['depth_mm','depthMm']],complete=dims.every(([,k])=>Number.isFinite(source[k])&&source[k]>0&&source[k]<=10000);
 const conflict=complete&&dims.some(([col,k])=>existing[col]!==null&&Number(existing[col])!==source[k]);
 if(complete&&!conflict)for(const [col,k] of dims)if(existing[col]===null)patch[col]=source[k];
 return {patch,conflict};
}

// Keep one self-SKU source intact. A newer sparse card must not discard a
// complete canonical detail; no cross-document attribute tuple is invented.
export function diorAttributeSourceBetter(next,previous){
 if(!previous)return true;
 const score=r=>Number(Boolean(r.color))+Number(Boolean(r.material))+['widthMm','heightMm','depthMm'].filter(k=>Number.isFinite(r[k])&&r[k]>0).length;
 const a=score(next),b=score(previous);
 return a>b||a===b&&next.sourceTime>=previous.sourceTime;
}
