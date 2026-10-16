import {celineNodes,celineText} from './celine-html.js';

// Verbatim, labeled specifications on the exact canonical KR product page.
// Never infer attributes from names, pictures, SKU suffixes or neighboring cards.
export function diorDetailAttributes(html,url,code){
 const normalize=s=>String(s??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
 let target;try{target=new URL(url);}catch{return {};}
 if(target.origin!=='https://www.dior.com'||!/^\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+$/.test(target.pathname)||target.search||normalize(target.pathname.split('/').at(-1))!==normalize(code))return {};
 const nodes=celineNodes(html),canonical=nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical').map(n=>n.attrs.href);
 if(canonical.length!==1||canonical[0]!==target.href)return {};
 const excluded=n=>{for(let p=n;p;p=p.parent){if(['header','footer','nav','aside'].includes(p.tag)||/recommend|related|cross-sell|recently|carousel/i.test(p.attrs.class??''))return true;for(const key of ['data-product-id','data-sku'])if(p.attrs[key]&&normalize(p.attrs[key])!==normalize(code))return true;}return false;};
 const materials=new Set(),dimensions=new Map();
 const material=/^(?:(?:(?:주요|메인)\s*)?소재|material)\s*[:：]\s*(.{1,160})$/i;
 const metric=/^(?:크기|치수|dimensions)\s*[:：]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm)\s*\(\s*(?:길이|가로|length)\s*[x×]\s*(?:높이|세로|height)\s*[x×]\s*(?:너비|폭|width|depth)\s*\)\s*$/i;
 for(const n of nodes){
  if(!['li','p','dd','div','span'].includes(n.tag)||excluded(n))continue;
  const text=celineText(n),m=text.match(material),d=text.match(metric);
  if(m&&!/[<>]|(?:색상|컬러|크기|치수|소재|material|dimensions)\s*[:：]/i.test(m[1]))materials.add(m[1].trim());
  if(d){const scale=d[4].toLowerCase()==='cm'?10:1,values=d.slice(1,4).map(v=>Number(v)*scale);if(values.every(v=>Number.isFinite(v)&&v>0&&v<=10000))dimensions.set(values.join('|'),{widthMm:values[0],heightMm:values[1],depthMm:values[2]});}
 }
 return {...(materials.size===1?{material:[...materials][0]}:{}),...(dimensions.size===1?[...dimensions.values()][0]:{})};
}
export function diorMissingAttributePatch(existing,source){
 const patch={};
 if(source.material&&existing.material_ko===null&&existing.material_original===null){patch.material_ko=source.material;patch.material_original=source.material;}
 const dims=[['width_mm','widthMm'],['height_mm','heightMm'],['depth_mm','depthMm']],complete=dims.every(([,k])=>Number.isFinite(source[k])&&source[k]>0&&source[k]<=10000);
 const conflict=complete&&dims.some(([col,k])=>existing[col]!==null&&Number(existing[col])!==source[k]);
 if(complete&&!conflict)for(const [col,k] of dims)if(existing[col]===null)patch[col]=source[k];
 return {patch,conflict};
}
