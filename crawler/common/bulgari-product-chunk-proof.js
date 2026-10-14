import {createHash} from "node:crypto";

// Frozen exact-source proof from the offline pinned AST receipt.
// Main: one immutable empty publicPath; exact literal-map filename; direct
// document.createElement(script) -> script.src loader; no inline overrides.
// Both complete source byte hashes are mandatory. No general URL allowlist,
// external boolean, filesystem, network, app parser or report dependency.
const PIN=Object.freeze({
  "html": "da627f716fc4aa321610dbe194c1cf20aa45b20fd1353525f819772fb7530614",
  "main": "204eefaadcbcf5dae8adda5f693c1067b607cf2ad2a64f5453278df577dea4aa",
  "htmlBytes": 1189181,
  "mainBytes": 2101359,
  "target": "https://www.bulgari.com/ko-kr/overrides-app-pages-product-detail.9f98c33d10aeac5466b2.js",
  "documentUrl": "https://www.bulgari.com/ko-kr/323532.html",
  "mainUrl": "https://www.bulgari.com/mobify/bundle/3189/main.ed56b3dc93aa16a4c81c.js",
  "filename": "overrides-app-pages-product-detail.9f98c33d10aeac5466b2.js"
});
function bytes(value){
 if(typeof value==='string'){if(Buffer.byteLength(value)>8388608)throw Error('CHUNK_SOURCE_LIMIT');return Buffer.from(value,'utf8');}
 if(Buffer.isBuffer(value)){if(value.length>8388608)throw Error('CHUNK_SOURCE_LIMIT');return value;}
 throw Error('CHUNK_SOURCE_TYPE');
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));

// The central caller owns fixed run receipts, freshness, scope and transport.
// true proves this frozen source intent, not HTTP/API/product availability.
export function validateBulgariProductChunk(html,mainSource,target){
 if(target!==PIN.target)return false;
 const mainBytes=bytes(mainSource);
 if(mainBytes.length!==PIN.mainBytes||hash(mainBytes)!==PIN.main)throw Error('CHUNK_MAIN_HASH_MISMATCH');
 let htmlBytes;try{htmlBytes=bytes(html);}catch{return false;}
 if(htmlBytes.length!==PIN.htmlBytes||hash(htmlBytes)!==PIN.html)return false;
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(htmlBytes);}catch{return false;}
 const markup=text.replace(/<!--[\s\S]*?-->/g,''),clean=markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 if(!/<html\b/i.test(clean)||/<base\b/i.test(clean))return false;
 const canonical=[...clean.matchAll(/<link\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>(a.rel??'').toLowerCase().split(/\s+/).includes('canonical')).map(a=>a.href);
 if(canonical.length!==1||canonical[0]!==PIN.documentUrl)return false;
 let bootstrap=0;
 for(const m of markup.matchAll(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>[\s\S]*?<\/script\s*>/gi)){
  const a=attrs(m[1]);if(a.src!==PIN.mainUrl)continue;
  if([...m[1].matchAll(/(?:^|\s)src\s*=/gi)].length!==1)return false;
  // The exact HTML hash already binds its actual bootstrap attributes to the
  // offline AST proof; do not add a second, differently decoded MIME parser.
  bootstrap++;
 }
 if(bootstrap!==1)return false;
 // Empty publicPath and absent base resolve against the actual fetched detail,
 // never an invented /mobify/bundle prefix. Complete HTML hash binds all inline JS.
 return new URL(PIN.filename,PIN.documentUrl).href===target;
}

