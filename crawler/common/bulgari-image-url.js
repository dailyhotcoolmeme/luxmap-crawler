// Validate published links only. Never synthesize an original from a rendition.
const direct=/^\/on\/demandware\.static\/-\/Sites-masterCatalog\/default\/dw[a-f0-9]+\/images\/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp)$/i;
function published(value){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.bulgari.com'||u.username||u.password||u.hash||/%|\\/.test(u.pathname))return null;return u;}catch{return null;}
}
function asset(u){
 if(!u)return null;
 if(direct.test(u.pathname))return u.pathname;
 const m=u.pathname.match(/^\/dw\/image\/v2\/[A-Z0-9_]+(\/on\/demandware\.static\/.*)$/i);
 return m&&direct.test(m[1])?m[1]:null;
}
export function bulgariOriginalImageUrl(value){
 const entries=typeof value==='string'?[value]:[value?.disBaseLink,value?.link,value?.url,value?.contentUrl];
 const links=entries.filter(v=>v!=null).map(published);
 if(links.some(v=>!v))throw Error('IMAGE_SOURCE_PATH');
 const originals=links.filter(u=>direct.test(u.pathname)&&!u.search);
 if(!originals.length)throw Error('IMAGE_ORIGINAL_UNPUBLISHED');
 const paths=new Set(links.map(asset));
 if(paths.has(null)||paths.size!==1)throw Error('IMAGE_SOURCE_CONFLICT');
 return originals[0].href;
}
