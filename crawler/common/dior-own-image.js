import {createHash} from 'node:crypto';
const norm=x=>String(x??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
export function diorOwnImageUrl(value){
 const u=new URL(value);if(u.origin!=='https://assets.christiandior.com'||u.username||u.password||!/^\/is\/image\/diorprod\/[A-Za-z0-9_-]{8,250}$/.test(u.pathname))throw Error('DIOR_OWN_IMAGE_PATH');u.search='';u.hash='';return u.href;
}
// Called only after the page parser verifies own identifier/code/backendSku,
// Korean locale, canonical and own KRW offer. Walk own views, never options.
export function diorOwnImageProof(product,canonical,source){
 const code=norm(product.code),u=new URL(canonical);if(u.origin!=='https://www.dior.com'||u.search||u.hash||!/^\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+$/.test(u.pathname)||norm(u.pathname.split('/').at(-1))!==code||norm(product.backendSku)!==code)throw Error('DIOR_OWN_IMAGE_IDENTITY');
 const urls=[];let visited=0;const walk=(v,depth=0)=>{if(++visited>3000||depth>10)throw Error('DIOR_OWN_IMAGE_BOUND');if(typeof v==='string'){try{const url=diorOwnImageUrl(v);if(!urls.includes(url))urls.push(url);}catch{}return;}if(v&&typeof v==='object')for(const x of Object.values(v))walk(x,depth+1);};walk(product.views?.transparent);walk(product.views);walk(product.medias);
 return {schema:1,code,canonical,sourceSha256:createHash('sha256').update(source).digest('hex'),urls:urls.slice(0,8)};
}
export function verifiedDiorOwnImage(value,code,proof){
 try{const url=diorOwnImageUrl(value),u=new URL(proof.canonical);return proof.schema===1&&proof.code===code&&u.origin==='https://www.dior.com'&&/^\/ko_kr\/fashion\/products\/[A-Z0-9]+_[A-Z0-9]+$/.test(u.pathname)&&!u.search&&!u.hash&&norm(u.pathname.split('/').at(-1))===code&&/^[a-f0-9]{64}$/.test(proof.sourceSha256)&&Array.isArray(proof.urls)&&proof.urls.length<=8&&proof.urls.includes(url);}catch{return false;}
}
