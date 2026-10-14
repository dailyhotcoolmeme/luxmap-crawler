// Pure bounded provenance. No filesystem, network, report imports, or code execution.
import {celineNodes} from './celine-html.js';
const sourceUrl='https://www.bulgari.com/ko-kr/323532.html';
const semanticRank=name=>/commerce|sdk|salesforce|shopper|retail/i.test(name)?0:/fetch|pwa|storefront|customer|product[-_.]?detail|(?:^|[-_.])api(?:[-_.]|$)/i.test(name)?1:/product(?!ion)/i.test(name)?2:/runtime|webpack/i.test(name)?3:4;
const mainUrl='https://www.bulgari.com/mobify/bundle/3189/main.ed56b3dc93aa16a4c81c.js';
export function inspectBulgariChunkMaps(source,parse,documentBase=null){
 if(typeof parse!=="function")throw Error("PINNED_PARSER_REQUIRED");
 if(typeof source!=='string'||Buffer.byteLength(source)>8388608)throw Error('SOURCE_LIMIT');
 let ast;try{ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});}catch{throw Error('STATIC_PARSE_FAILED');}
 const nodes=[],stack=[ast],parents=new WeakMap();
 while(stack.length){const n=stack.pop();if(nodes.length>=2000000)throw Error('NODE_LIMIT');nodes.push(n);for(const v of Object.values(n))if(Array.isArray(v)){for(const c of v)if(c&&typeof c.type==='string'){parents.set(c,n);stack.push(c);}}else if(v&&typeof v.type==='string'){parents.set(v,n);stack.push(v);}}
 const scope=n=>{let p=parents.get(n);while(p&&!['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration','Program'].includes(p.type))p=parents.get(p);return p;};
 // Resolve minified identifiers lexically: unrelated `e[key]` in another module
 // must not become a write to the webpack runtime merely because names match.
 const declarations=new WeakMap(),scopeIds=new WeakMap();let nextScope=0;
 const declare=(owner,name)=>{if(!owner||!name)return;if(!declarations.has(owner)){declarations.set(owner,new Set());scopeIds.set(owner,++nextScope);}declarations.get(owner).add(name);};
 const pattern=(n,owner)=>{if(!n)return;if(n.type==='Identifier')declare(owner,n.name);else if(n.type==='ObjectPattern')for(const p of n.properties)pattern(p.type==='RestElement'?p.argument:p.value,owner);else if(n.type==='ArrayPattern')for(const p of n.elements)pattern(p,owner);else if(n.type==='AssignmentPattern')pattern(n.left,owner);else if(n.type==='RestElement')pattern(n.argument,owner);};
 for(const n of nodes){if(n.type==='VariableDeclarator')pattern(n.id,scope(n));if(n.type==='CatchClause')pattern(n.param,scope(n));if(['FunctionExpression','ArrowFunctionExpression','FunctionDeclaration'].includes(n.type)){for(const p of n.params)pattern(p,n);if(n.type==='FunctionDeclaration')declare(scope(n),n.id?.name);else if(n.id)declare(n,n.id.name);}}
 const bindingKey=(n,name)=>{let owner=scope(n);while(owner){if(declarations.get(owner)?.has(name))return `${scopeIds.get(owner)}:${name}`;owner=scope(owner);}return `global:${name}`;};
 const member=(n,key)=>n?.type==='MemberExpression'&&n.object.type==='Identifier'&&((!n.computed&&n.property.name===key)||(n.computed&&n.property.value===key))?bindingKey(n.object,n.object.name):null;
 const stats={staticImports:0,dynamicImports:0,chunkBuilders:0,publicPathLiterals:0,publicPathAssignments:0,pathStringAssignments:0,emptyPublicPaths:0,runtimePathOverrides:0,loaderJoins:0,loaderFlows:0,domSrcDirect:0,domSrcCall:0,domSrcOther:0,mapEntries:0,semanticMapNames:0,mappedFilenames:0,relativeChunkPaths:0,exactChunkUrls:0,unresolvedBuilders:0};
 const imports=[],chunks=[],privateMaps=[],privateChunkFiles=[],unresolved=Symbol('unresolved');
 const safe=(value,base=mainUrl)=>{try{const u=new URL(value,base);return typeof value==='string'&&value.length<500&&!/[{}$\\\s%]/.test(value)&&u.origin==='https://www.bulgari.com'&&!u.search&&!u.hash&&!u.username&&!u.password&&(/^\/mobify\/bundle\/3189\/[A-Za-z0-9._-]+\.js$/.test(u.pathname)||(base===sourceUrl&&/^\/ko-kr\/[A-Za-z0-9._/-]+\.js$/.test(u.pathname)))?u.href:null;}catch{return null;}};
 for(const n of nodes){
  if(n.type==='ImportDeclaration'||n.type==='ExportNamedDeclaration'||n.type==='ExportAllDeclaration'||n.type==='ImportExpression'){
   const value=n.source?.value;if(typeof value!=='string')continue;stats[n.type==='ImportExpression'?'dynamicImports':'staticImports']++;
   const url=/^(?:https:\/\/|\.{1,2}\/|\/)/.test(value)?safe(value):null;if(url)imports.push({url,rank:semanticRank(url.split('/').at(-1)),provenance:['exact-import-literal'],sourceStart:n.start});
  }
 }
 // Deliberately tiny expression algebra: literals, parameter, map lookup, +, ||.
 // No eval, calls, getters, environment values, or guessed public paths.
 function literal(n,param,id,depth=0){
  if(!n||depth>40)return unresolved;
  if(n.type==='Literal'&&['string','number'].includes(typeof n.value))return n.value;
  if(n.type==='Identifier'&&n.name===param)return id;
  if(n.type==='BinaryExpression'&&n.operator==='+'){const a=literal(n.left,param,id,depth+1),b=literal(n.right,param,id,depth+1);return a===unresolved||b===unresolved?unresolved:a+b;}
  if(n.type==='LogicalExpression'&&n.operator==='||'){const a=literal(n.left,param,id,depth+1);return a===unresolved?unresolved:a||literal(n.right,param,id,depth+1);}
  if(n.type==='MemberExpression'&&n.computed&&n.object.type==='ObjectExpression'){
   if(n.object.properties.some(p=>p.type!=='Property'||p.computed||p.kind!=='init'||p.method))return unresolved;
   const key=literal(n.property,param,id,depth+1);if(key===unresolved)return unresolved;
   const found=n.object.properties.filter(p=>p.type==='Property'&&!p.computed&&p.kind==='init'&&!p.method&&String(p.key.name??p.key.value)===String(key));
   return found.length===1?literal(found[0].value,param,id,depth+1):unresolved;
  }
  return unresolved;
 }
 const assignments=nodes.filter(n=>n.type==='AssignmentExpression'&&n.operator==='=');
 for(const assignment of assignments){
  const binding=member(assignment.left,'u'),fn=assignment.right;if(!binding||!['ArrowFunctionExpression','FunctionExpression'].includes(fn.type))continue;stats.chunkBuilders++;
  if(stats.chunkBuilders>4)throw Error('CHUNK_BUILDER_LIMIT');
  const paths=assignments.filter(n=>member(n.left,'p')===binding),builders=assignments.filter(n=>member(n.left,'u')===binding);
  const pathWrites=nodes.filter(n=>(n.type==='AssignmentExpression'&&member(n.left,'p')===binding)||(n.type==='UpdateExpression'&&member(n.argument,'p')===binding));
  const dynamicWrites=nodes.some(n=>n.type==='AssignmentExpression'&&n.left.type==='MemberExpression'&&n.left.object.type==='Identifier'&&bindingKey(n.left.object,n.left.object.name)===binding&&n.left.computed&&n.left.property.type!=='Literal');
  const reflectiveWrites=nodes.some(n=>n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&['assign','defineProperty','defineProperties','set'].includes(n.callee.property.name)&&n.arguments[0]?.type==='Identifier'&&bindingKey(n.arguments[0],n.arguments[0].name)===binding);
  const methodOverrides=['u','l'].some(key=>nodes.filter(n=>(n.type==='AssignmentExpression'&&member(n.left,key)===binding)||(n.type==='UpdateExpression'&&member(n.argument,key)===binding)).some(n=>n.type!=='AssignmentExpression'||n.operator!=='=')||assignments.filter(n=>member(n.left,key)===binding).length>1);
  const overridden=pathWrites.length!==1||pathWrites[0].operator!=='='||dynamicWrites||reflectiveWrites||methodOverrides;
  if(overridden)stats.runtimePathOverrides++;
  const loaders=assignments.filter(n=>member(n.left,'l')===binding&&['ArrowFunctionExpression','FunctionExpression'].includes(n.right.type));
  let directScriptLoader=false;
  for(const item of loaders){const name=item.right.params[0]?.name;
   const parameterChanged=nodes.some(n=>scope(n)===item.right&&((n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&n.left.name===name)||(n.type==='UpdateExpression'&&n.argument.type==='Identifier'&&n.argument.name===name)));
   for(const a of assignments.filter(a=>a.left.type==='MemberExpression'&&!a.left.computed&&a.left.property.name==='src'&&scope(a)===item.right)){
    if(a.right.type==='Identifier'&&a.right.name===name){stats.domSrcDirect++;
     const target=a.left.object.name;
     const created=nodes.some(n=>scope(n)===item.right&&((n.type==='AssignmentExpression'&&n.left.type==='Identifier'&&n.left.name===target)||(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.id.name===target))&&(()=>{const call=n.right??n.init;return call?.type==='CallExpression'&&call.callee.type==='MemberExpression'&&call.callee.object.name==='document'&&call.callee.property.name==='createElement'&&call.arguments[0]?.value==='script';})());
     if(created&&!parameterChanged&&loaders.length===1)directScriptLoader=true;
    }else if(a.right.type==='CallExpression')stats.domSrcCall++;else stats.domSrcOther++;
   }
  }
  stats.publicPathAssignments+=paths.length;stats.pathStringAssignments+=paths.filter(p=>p.right.type==='Literal'&&typeof p.right.value==='string').length;
  stats.emptyPublicPaths+=paths.filter(p=>p.right.type==='Literal'&&p.right.value==='').length;
  const mapNodes=[fn.body],mapNames=new Set();
  while(mapNodes.length){const n=mapNodes.pop();if(!n)continue;
   if(n.type==='ObjectExpression')for(const p of n.properties)if(p.type==='Property'&&!p.computed&&p.kind==='init'&&!p.method){stats.mapEntries++;if(p.value.type==='Literal'&&typeof p.value.value==='string'&&p.value.value.length<=500&&semanticRank(p.value.value)<4){mapNames.add(p.value.value);privateMaps.push({name:p.value.value,mapStart:n.start});}}
   for(const v of Object.values(n))if(Array.isArray(v)){for(const c of v)if(c&&typeof c.type==='string')mapNodes.push(c);}else if(v&&typeof v.type==='string')mapNodes.push(v);
  }
  stats.semanticMapNames+=mapNames.size;
  const joins=nodes.filter(n=>n.type==='BinaryExpression'&&n.operator==='+'&&member(n.left,'p')===binding&&n.right.type==='CallExpression'&&member(n.right.callee,'u')===binding);
  stats.loaderJoins+=joins.length;
  if(overridden||paths.length!==1||builders.length!==1||typeof paths[0].right.value!=='string'||paths[0].right.type!=='Literal'||fn.params.length!==1||fn.params[0].type!=='Identifier'){stats.unresolvedBuilders++;continue;}
  stats.publicPathLiterals++;
  // A joined expression alone does not prove a network loader. Require it as .l's URL arg.
  const loader=nodes.some(n=>{
   if(n.type!=='CallExpression'||member(n.callee,'l')!==binding)return false;
   if(joins.includes(n.arguments[0]))return true;
   if(n.arguments[0]?.type!=='Identifier')return false;
   const name=n.arguments[0].name,local=scope(n),defs=nodes.filter(d=>d.type==='VariableDeclarator'&&d.id.type==='Identifier'&&d.id.name===name&&scope(d)===local);
   if(defs.length!==1||!joins.includes(defs[0].init))return false;
   return !nodes.some(d=>scope(d)===local&&((d.type==='AssignmentExpression'&&d.left.type==='Identifier'&&d.left.name===name)||(d.type==='UpdateExpression'&&d.argument.type==='Identifier'&&d.argument.name===name)));
  });
  if(!loader){stats.unresolvedBuilders++;continue;}
  stats.loaderFlows++;
  const body=fn.body.type==='BlockStatement'&&fn.body.body.length===1&&fn.body.body[0].type==='ReturnStatement'?fn.body.body[0].argument:fn.body.type==='BlockStatement'?null:fn.body;
  const ids=new Set(),pending=[body];while(pending.length){const n=pending.pop();if(!n)continue;if(n.type==='ObjectExpression')for(const p of n.properties)if(p.type==='Property'&&!p.computed&&p.kind==='init'&&!p.method)ids.add(String(p.key.name??p.key.value));for(const v of Object.values(n))if(Array.isArray(v)){for(const c of v)if(c&&typeof c.type==='string')pending.push(c);}else if(v&&typeof v.type==='string')pending.push(v);}
  if(ids.size>20000)throw Error('CHUNK_LIMIT');
  for(const id of ids){const suffix=literal(body,fn.params[0].name,/^\d+$/.test(id)?Number(id):id);if(typeof suffix!=='string'||!suffix.endsWith('.js'))continue;stats.mappedFilenames++;privateChunkFiles.push({filename:suffix,rank:semanticRank(suffix),sourceStart:assignment.start});const assembled=paths[0].right.value+suffix;let url;
   if(!/^(?:https:\/\/|\/)/.test(assembled)){stats.relativeChunkPaths++;if(documentBase==='https://www.bulgari.com/mobify/bundle/3189/'||(documentBase===sourceUrl&&directScriptLoader))url=safe(assembled,documentBase);}else url=safe(assembled);
   if(!url)continue;stats.exactChunkUrls++;chunks.push({url,rank:semanticRank(url.split('/').at(-1)),provenance:[documentBase===sourceUrl?'exact-map-fallback-document-loader':'exact-webpack-map-path-loader'],sourceStart:assignment.start,documentBase,witness:{chunkId:id,parameter:fn.params[0].name,binding:assignment.left.object.name,builderSpan:[assignment.start,assignment.end],expressionSpan:[body.start,body.end],pathSpan:[paths[0].right.start,paths[0].right.end],loaderSpan:loaders[0]?[loaders[0].start,loaders[0].end]:null}});}
 }
 const candidates=[...new Map([...imports,...chunks].map(c=>[c.url,c])).values()];
 return {stats,candidates,privateMaps,privateChunkFiles,requestVerified:false};
}

export function validateBulgariChunkUrl(url){
 if(typeof url!=='string'||url.length>500||!/^https:\/\/www\.bulgari\.com\/ko-kr\/[A-Za-z0-9._-]+\.js$/.test(url))throw Error('UNAUTHORIZED_CHUNK_URL');
 const parsed=new URL(url);if(parsed.href!==url||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('UNAUTHORIZED_CHUNK_URL');
 return url;
}

function inlineRuntimeSafe(text,parse,reject=()=>false){
 if(Buffer.byteLength(text)>2097152)throw Error('INLINE_SOURCE_LIMIT');
 let ast;try{ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});}catch{throw Error('INLINE_PARSE_FAILED');}
 const stack=[ast];let visits=0;
 const key=n=>n?.type==='Identifier'?n.name:n?.type==='Literal'?String(n.value):n?.type==='BinaryExpression'&&n.operator==='+'?key(n.left)+key(n.right):'?';
 const sensitive=k=>['p','u','l','publicPath','__webpack_public_path__','__webpack_require__'].includes(k);
 while(stack.length){const n=stack.pop();if(++visits>200000)throw Error('INLINE_NODE_LIMIT');
  if(n.type==='AssignmentExpression'||n.type==='UpdateExpression'||(n.type==='UnaryExpression'&&n.operator==='delete')){
   const left=n.left??n.argument;
   if(left.type==='Identifier'&&/__webpack_public_path__|__webpack_require__/.test(left.name))return reject('INLINE_RUNTIME_BINDING_WRITE');
   if(left.type==='MemberExpression'&&(sensitive(key(left.property))||(left.computed&&/webpack|runtime|require/i.test(key(left.object)))))return reject('INLINE_RUNTIME_PROPERTY_WRITE');
  }
  if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&/__webpack_public_path__|__webpack_require__/.test(n.id.name))return reject('INLINE_RUNTIME_BINDING_DECLARED');
  if(n.type==='CallExpression'||n.type==='NewExpression'){
   const name=key(n.callee.type==='MemberExpression'?n.callee.property:n.callee);
   if(['eval','Function'].includes(name))return reject('INLINE_DYNAMIC_CODE');
   if(['defineProperty','defineProperties','assign','set'].includes(name)){
    if(n.arguments.some(a=>a.type==='Literal'&&sensitive(String(a.value))))return reject('INLINE_RUNTIME_REFLECTIVE_WRITE');
    if(n.arguments.some(a=>a.type==='ObjectExpression'&&a.properties.some(p=>p.type!=='Property'||sensitive(key(p.key)))))return reject('INLINE_RUNTIME_REFLECTIVE_WRITE');
   }
  }
  for(const value of Object.values(n))if(Array.isArray(value)){for(const c of value)if(c&&typeof c.type==='string')stack.push(c);}else if(value&&typeof value.type==='string')stack.push(value);
 }
 return true;
}

// Main must independently verify fixed official source receipts, freshness and byte hashes.
// This checks source intent only: true does not prove an HTTP response or product API.
export function hasPublishedBulgariChunk(html,mainSource,target,{parse,onReject}={}){
 const reject=code=>{onReject?.(code);return false;};
 if(typeof parse!=='function')throw Error('PINNED_PARSER_REQUIRED');
 validateBulgariChunkUrl(target);
 if(typeof html!=='string'||Buffer.byteLength(html)>8388608)throw Error('SOURCE_LIMIT');
 if(typeof mainSource!=='string'||Buffer.byteLength(mainSource)>8388608)throw Error('SOURCE_LIMIT');
 if(!/<html\b/i.test(html)||/cf-chl|challenge-platform|px-captcha|captcha-delivery|verify you are human/i.test(html))return reject('SOURCE_HTML_NOT_NORMAL');
 const markup=html.replace(/<!--[\s\S]*?-->/g,'').replace(/<(?:style|textarea|title)\b[^>]*>[\s\S]*?<\/(?:style|textarea|title)>/gi,'');
 const nodes=celineNodes(markup),canon=nodes.filter(n=>n.tag==='link'&&(n.attrs.rel??'').toLowerCase().split(/\s+/).includes('canonical'));
 if(canon.length!==1||canon[0].attrs.href!==sourceUrl)return reject('DOCUMENT_IDENTITY_UNPROVEN');
 if(nodes.some(n=>n.tag==='base'&&n.attrs.href!==undefined))return reject('DOCUMENT_BASE_OVERRIDE');
 let published=0,scripts=0,totalInline=0;
 for(const m of markup.matchAll(/<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/script\s*>/gi)){
  if(++scripts>1000)throw Error('SCRIPT_LIMIT');
  const opening=`<script${m[1]}>`,attrs=celineNodes(opening)[0]?.attrs??{};
  if([...m[1].matchAll(/(?:^|\s)src\s*=/gi)].length>1)return reject('DUPLICATE_SCRIPT_SRC');
  // async/defer do not invalidate source membership: all executable inline
  // scripts are checked irrespective of order, and main's path is immutable.
  if(attrs.src){if(attrs.src===mainUrl){if(attrs.type==='module')return reject('MAIN_BOOTSTRAP_TYPE_UNSUPPORTED');published++;}continue;}
  totalInline+=Buffer.byteLength(m[2]);if(totalInline>8388608)throw Error('INLINE_TOTAL_LIMIT');
  const type=(attrs.type??'').trim().toLowerCase();
  // HTML JSON MIME script blocks are inert data even when their contents are
  // invalid JSON. Never execute/interpret them as JS or infer runtime writes.
  if(['application/json','application/ld+json'].includes(type))continue;
  if(['importmap','speculationrules'].includes(type))return reject('INLINE_SCRIPT_TYPE_UNSUPPORTED');
  const javascript=/^(?:(?:application|text)\/(?:x-)?(?:javascript|ecmascript)|text\/(?:javascript1\.[0-5]|jscript|livescript))$/;
  // Other MIME types are inert HTML data blocks, not executable scripts.
  if(type&&type!=='module'&&!javascript.test(type.split(';',1)[0].trim()))continue;
  if(!inlineRuntimeSafe(m[2],parse,reject))return false;
 }
 if(published!==1)return reject('EXACT_MAIN_BOOTSTRAP_MISSING');
 const result=inspectBulgariChunkMaps(mainSource,parse,sourceUrl);
 if(result.stats.chunkBuilders!==1||result.stats.runtimePathOverrides!==0||result.stats.domSrcDirect!==1||result.stats.domSrcCall||result.stats.domSrcOther||result.stats.loaderFlows!==1)return reject('EXACT_MAIN_LOADER_UNPROVEN');
 return result.candidates.some(c=>c.url===target&&c.provenance.includes('exact-map-fallback-document-loader'))||reject('EXACT_TARGET_MAPPING_MISSING');
}

