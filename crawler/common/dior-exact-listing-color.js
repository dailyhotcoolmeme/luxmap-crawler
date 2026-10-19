import {diorPageDataProduct} from './dior-page-data.js';
const norm=v=>String(v??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
export function diorExactListingColor(source,targetSource,targetUrl){
 if(typeof source!=='string'||typeof targetSource!=='string'||Buffer.byteLength(source)>8388608||Buffer.byteLength(targetSource)>8388608)throw Error('COLOR_SOURCE_BOUND');
 let doc,target;try{doc=JSON.parse(source);target=JSON.parse(targetSource);}catch{throw Error('COLOR_SOURCE_JSON');}
 const own=target?.pageProps?.product,dict=doc?.pageProps?.queriesProductsDictionnary;
 if(doc?.pageProps?.locale!=='ko_kr'||!own||!dict||typeof dict!=='object'||Array.isArray(dict)||Object.keys(dict).length>100)return null;
 if(!diorPageDataProduct(targetSource,targetUrl,own.code))return null;
 const values=[];
 for(const query of Object.values(dict)){
  if(!Array.isArray(query?.hits)||query.hits.length>10000)continue;
  for(const hit of query.hits){
   if(norm(hit?.code)!==norm(own.code))continue;
   const sameBackend=norm(hit?.backendSku)===norm(own.backendSku),samePublishedVariation=Array.isArray(own.variations)&&own.variations.some(v=>typeof hit.sku==='string'&&v.sku===hit.sku&&typeof hit.backendSku==='string'&&v.backendSku===hit.backendSku);
   if(!sameBackend&&!samePublishedVariation)continue;
   let url;try{url=new URL(hit.productLink?.uri,'https://www.dior.com');}catch{continue;}
   if(url.href!==targetUrl||url.username||url.password||hit.title!==own.title||hit.subtitle!==own.subtitle||hit.price?.currency!=='KRW'||hit.price.value!==own.price.value)continue;
   const label=hit.color?.label;if(typeof label!=='string'||!label.trim()||label.length>120||/[<>\x00-\x1f]/.test(label)||/^#?[0-9a-f]{6}$/i.test(label)||/^(?:기타|unknown|other|색상|color)$/i.test(label.trim()))continue;
   values.push(label.trim());
  }
 }
 if(!values.length)return null;if(new Set(values).size!==1)throw Error('EXACT_LIST_COLOR_CONFLICT');
 return {colorOriginal:values[0],colorDisplay:values[0]};
}
