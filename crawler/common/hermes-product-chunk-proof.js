import {createHash} from 'node:crypto';

// Frozen source-version proof, generated/checked offline by
// scripts/pin-hermes-product-chunk-evidence.mjs using the locked app parser.
// main: literal path "product", loadChildren includes each pinned chunk below,
// bind entry module 82681. Non-2681 entries are shared route dependencies; their
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
 '436.46515c42663caf01.js',
 '1112.e7f83d1de429ed23.js',
 '3927.e6844990d09dc2aa.js',
 '2589.54eb5594efeee75c.js',
 '3059.1406c7aeddd1a3fd.js',
 '18.545e00cf4806946a.js',
 '133.74e6b481d84ed58b.js',
 '3097.63fd9f4a5177fae1.js',
 '2238.a39435637f09d76d.js',
 '8673.75f0eec4997af0c9.js',
 '3546.6deabbe4d3b554d0.js',
 '2161.a1be2ec3e3079ad2.js',
 '3660.3e2d5a925bac385a.js',
 '4736.382cf80510b5bd2f.js',
 '1101.6ed4b161ea2d1854.js',
 '1018.8c8b4cfd37f5aea6.js',
 '7635.8c13edee07af7f04.js',
 '2329.ff36e226065f227c.js',
 '8715.84dea2cdde5d8ab9.js',
 '9067.d07e0931a35761dc.js',
 '359.f18febb0571363bd.js',
 '5551.b7b55ed600f1aa6a.js',
 '932.2ebaae815e487c80.js',
 '4619.21b9e063032703b6.js',
 '1951.595438c6c1e6af92.js',
 '6322.183aeea476dae8ff.js',
 '3869.77c45a38eaa3a9af.js',
 '2735.258bffaa82029b44.js',
 '8003.09167a92e47c5d6c.js',
 '1298.db55006e8b5c1943.js',
 '2276.18297d8cdcdb277c.js',
]);
const DEPENDENCY_URLS=Object.freeze(FILENAMES.map(name=>`https://www.hermes.com/kr/ko/${name}`));
// Inventory only, not request authorization: each request still must call
// validateHermesProductChunk with all three exact source byte sequences.
export function hermesProductDependencyUrls(){return DEPENDENCY_URLS;}
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
