import {createHash} from 'node:crypto';

// Frozen source-version proof, generated/checked offline by
// scripts/pin-hermes-product-chunk-evidence.mjs using the locked app parser.
// main: literal path "product", loadChildren includes 2681, 2276, 1298,
// bind entry module 82681. 2276/1298 are shared route dependencies; their
// contained module IDs are NOT attested. Runtime mapping was independently
// resolved with the pinned offline parser for each exact filename below.
// p="". HTML: published /kr/ko/ base and both exact script src tags.
// All THREE complete source byte hashes are mandatory. These are not an
// externally supplied "verified" flag or a general-purpose chunk allowlist.
const PIN=Object.freeze({
 html:'febd2a057336042ef54bca678866a571c3a823b5ec2c927486653f69b7a0c97e',
 main:'51d4be90e86e93f13122a142e0846f1867f036124c877cb8f3791b00bdcef7cb',
 runtime:'ca3e17aa826963860370d57d528f1442b59ea98a06ec13a9991d95d086af83bb',
 mainUrl:'https://www.hermes.com/kr/ko/main.512d3bc35b6ae972.js',
 runtimeUrl:'https://www.hermes.com/kr/ko/runtime.d9db7c0cd2a87d6b.js',
});
const FILENAMES=Object.freeze([
 '2681.3ca69cb105cc8c16.js',
 '2276.18297d8cdcdb277c.js',
 '1298.db55006e8b5c1943.js',
]);
function bytes(value){
 if(typeof value==='string'){if(Buffer.byteLength(value)>8388608)throw Error('CHUNK_SOURCE_LIMIT');return Buffer.from(value,'utf8');}
 if(Buffer.isBuffer(value)){if(value.length>8388608)throw Error('CHUNK_SOURCE_LIMIT');return value;}
 throw Error('CHUNK_SOURCE_TYPE');
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase(),m[2]??m[3]]));

// Pure/no filesystem/no network/no parser dependency. Core version mismatches
// throw; a nonmatching HTML file in the approved run simply returns false.
export function validateHermesProductChunk(html,mainSource,runtimeSource,target){
 const filename=FILENAMES.find(name=>target===`https://www.hermes.com/kr/ko/${name}`);
 if(!filename)return false;
 const mainBytes=bytes(mainSource),runtimeBytes=bytes(runtimeSource);
 if(hash(mainBytes)!==PIN.main)throw Error('CHUNK_MAIN_HASH_MISMATCH');
 if(hash(runtimeBytes)!==PIN.runtime)throw Error('CHUNK_RUNTIME_HASH_MISMATCH');
 let htmlBytes;try{htmlBytes=bytes(html);}catch{return false;}
 if(hash(htmlBytes)!==PIN.html)return false;
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(htmlBytes);}catch{return false;}
 const markup=text.replace(/<!--[\s\S]*?-->/g,''),clean=markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
 const canonicals=[...clean.matchAll(/<link\b[^>]*>/gi)].map(m=>attrs(m[0])).filter(a=>a.rel?.split(/\s+/).includes('canonical')).map(a=>a.href);
 if(canonicals.length!==1)return false;
 let canonical;try{canonical=new URL(canonicals[0]);}catch{return false;}
 if(canonical.origin!=='https://www.hermes.com'||canonical.username||canonical.password||canonical.search||canonical.hash||!canonical.pathname.startsWith('/kr/ko/category/leather-goods/bags-and-clutches/'))return false;
 const bases=[...clean.matchAll(/<base\b[^>]*>/gi)].map(m=>attrs(m[0]).href);
 if(bases.length!==1||bases[0]!=='/kr/ko/')return false;
 const scripts=new Set();for(const m of markup.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script>/gi)){
  const raw=attrs(m[1]).src;if(!raw||raw.startsWith('//')||/[\\\s{}<>$]/.test(raw)||!raw.startsWith('/')&&!raw.startsWith('https://www.hermes.com/'))continue;
  try{scripts.add(new URL(raw,'https://www.hermes.com/').href);}catch{}
 }
 if(!scripts.has(PIN.mainUrl)||!scripts.has(PIN.runtimeUrl))return false;
 // The exact frozen sources establish the runtime mapping and empty publicPath;
 // only the actually published base is applied with standard URL resolution.
 return new URL(filename,new URL(bases[0],'https://www.hermes.com/')).href===target;
}
