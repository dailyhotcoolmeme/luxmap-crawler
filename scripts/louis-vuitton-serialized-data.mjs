import {verifiedAcorn} from '../crawler/common/verified-lv-acorn.js';
// Decode embedded Nuxt constant serialization, not application bundles. No eval,
// VM, browser execution, globals, external objects, API discovery or network I/O.
export function louisVuittonSerializedData(script,diagnostics={}){
 if(script.length>2097152)throw Error('SERIALIZATION_LIMIT');
 const {parse}=verifiedAcorn(),ast=parse(script,{ecmaVersion:2022});let visited=0;
 const absent=Symbol('unresolved');
 const owned=new WeakSet(),forbidden=new Set(['__proto__','constructor','prototype']);
 function keyOf(n,env,depth){const k=n.computed?value(n.property,env,depth+1):n.property.name;return (typeof k==='string'||typeof k==='number')&&!forbidden.has(String(k))?String(k):null;}
 function value(n,env=new Map(),depth=0){
  if(!n||depth>70||++visited>300000)throw Error('SERIALIZATION_LIMIT');
  if(n.type==='Literal')return n.regex||typeof n.value==='bigint'?absent:n.value;
  if(n.type==='Identifier')return env.has(n.name)?env.get(n.name):n.name==='undefined'?undefined:absent;
  if(n.type==='UnaryExpression'&&['-','+','!','void'].includes(n.operator)){const v=value(n.argument,env,depth+1);if(v===absent)return absent;return n.operator==='-'?-v:n.operator==='+'?+v:n.operator==='!'?!v:undefined;}
  if(n.type==='ArrayExpression'){const out=n.elements.map(e=>e?value(e,env,depth+1):null).map(v=>v===absent?null:v);owned.add(out);return out;}
  if(n.type==='ObjectExpression'){const out=Object.create(null);owned.add(out);for(const p of n.properties){if(p.type!=='Property'||p.computed||p.kind!=='init'||p.method)continue;const k=p.key.name??p.key.value;if(forbidden.has(String(k)))continue;const v=value(p.value,env,depth+1);if(v!==absent)out[k]=v;}return out;}
  if(n.type==='MemberExpression'){const object=value(n.object,env,depth+1),key=keyOf(n,env,depth);return object&&owned.has(object)&&key!==null&&Object.hasOwn(object,key)?object[key]:absent;}
  if(n.type==='BinaryExpression'&&['+','-','*','/'].includes(n.operator)){const a=value(n.left,env,depth+1),b=value(n.right,env,depth+1);if(!['string','number'].includes(typeof a)||!['string','number'].includes(typeof b))return absent;return n.operator==='+'?a+b:n.operator==='-'?a-b:n.operator==='*'?a*b:a/b;}
  if(n.type==='LogicalExpression'&&['||','&&','??'].includes(n.operator)){const a=value(n.left,env,depth+1);if(a===absent)return absent;return n.operator==='||'?(a||value(n.right,env,depth+1)):n.operator==='&&'?(a&&value(n.right,env,depth+1)):(a??value(n.right,env,depth+1));}
  if(n.type==='ConditionalExpression'){const test=value(n.test,env,depth+1);return test===absent?absent:value(test?n.consequent:n.alternate,env,depth+1);}
  if(n.type==='SequenceExpression'){let last;for(const expression of n.expressions)last=value(expression,env,depth+1);return last;}
  if(n.type==='AssignmentExpression'&&n.operator==='='){
   const v=value(n.right,env,depth+1);if(v===absent)return absent;
   if(n.left.type==='Identifier'&&env.has(n.left.name)){env.set(n.left.name,v);return v;}
   if(n.left.type==='MemberExpression'){const object=value(n.left.object,env,depth+1),key=keyOf(n.left,env,depth);if(!object||!owned.has(object)||key===null||Array.isArray(object)&&!(/^(?:0|[1-9]\d{0,3})$/.test(key))){diagnostics.UNRESOLVED_DATA_ASSIGNMENT=(diagnostics.UNRESOLVED_DATA_ASSIGNMENT??0)+1;return absent;}object[key]=v;return v;}return absent;
  }
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.property.name==='push'){const array=value(n.callee.object,env,depth+1),items=n.arguments.map(a=>value(a,env,depth+1));if(!Array.isArray(array)||!owned.has(array)||items.includes(absent)||array.length+items.length>10000)return absent;return array.push(...items);}
  if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='Array'&&!env.has('Array')&&n.arguments.length===1){const length=value(n.arguments[0],env,depth+1);if(!Number.isInteger(length)||length<0||length>10000)return absent;const out=new Array(length);owned.add(out);return out;}
  if(n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.object.name==='JSON'&&n.callee.property.name==='parse'&&n.arguments.length===1){const text=value(n.arguments[0],env,depth+1);if(typeof text!=='string'||text.length>2097152)return absent;try{return JSON.parse(text);}catch{return absent;}}
  if(n.type==='CallExpression'&&n.callee.type==='FunctionExpression'&&!n.callee.async&&!n.callee.generator){const fn=n.callee,body=fn.body.body.filter(s=>!s.directive);if(fn.params.some(p=>p.type!=='Identifier'))return absent;const args=n.arguments.map(a=>value(a,env,depth+1)),bindings=new Map(env);fn.params.forEach((p,i)=>bindings.set(p.name,args[i]));for(const statement of body){if(statement.type==='ReturnStatement')return value(statement.argument,bindings,depth+1);if(statement.type==='VariableDeclaration'){for(const d of statement.declarations){if(d.id.type!=='Identifier')return absent;bindings.set(d.id.name,d.init?value(d.init,bindings,depth+1):undefined);}continue;}if(statement.type==='ExpressionStatement'&&['AssignmentExpression','SequenceExpression'].includes(statement.expression.type)){if(value(statement.expression,bindings,depth+1)===absent)return absent;continue;}diagnostics.IIFE_SETUP_UNRESOLVED=(diagnostics.IIFE_SETUP_UNRESOLVED??0)+1;return absent;}return absent;}
  if(n.type==='NewExpression'&&n.callee.type==='Identifier'&&n.callee.name==='Set'&&!env.has('Set')&&n.arguments.length<=1){const items=n.arguments.length?value(n.arguments[0],env,depth+1):[];if(!Array.isArray(items)||items.length>10000)return absent;const out=Object.create(null);owned.add(out);out.serializedSetValues=[...new Set(items)];return out;}
  if(n.type==='NewExpression'){const shape=n.callee.type==='Identifier'&&['Date','Array','Map','Set','RegExp'].includes(n.callee.name)?n.callee.name.toUpperCase():'OTHER';diagnostics['NEW_SHAPE_'+shape]=(diagnostics['NEW_SHAPE_'+shape]??0)+1;}
  if(n.type==='CallExpression'){
   const c=n.callee,allowed=new Set(['split','concat','slice','assign','freeze','parse','push','Array','Object']);
   const raw=c.type==='Identifier'?c.name:c.type==='MemberExpression'&&!c.computed?c.property.name:'';
   const shape=allowed.has(raw)?raw.toUpperCase():c.type.toUpperCase();
   const key='CALL_SHAPE_'+shape;diagnostics[key]=(diagnostics[key]??0)+1;
  }
  diagnostics['UNRESOLVED_'+n.type.toUpperCase()]=(diagnostics['UNRESOLVED_'+n.type.toUpperCase()]??0)+1;return absent;
 }
 const outputs=[];for(const s of ast.body){const expr=s.type==='ExpressionStatement'?s.expression:null;for(const e of expr?.type==='SequenceExpression'?expr.expressions:[expr]){if(e?.type!=='AssignmentExpression'||e.operator!=='='||e.left.type!=='MemberExpression'||e.left.object.type!=='Identifier'||e.left.object.name!=='window')continue;const key=e.left.computed?e.left.property.value:e.left.property.name;if(key!=='__NUXT__')continue;diagnostics.NUXT_ASSIGNMENT=(diagnostics.NUXT_ASSIGNMENT??0)+1;const v=value(e.right);if(v!==absent)outputs.push(v);}}
 return outputs;
}
