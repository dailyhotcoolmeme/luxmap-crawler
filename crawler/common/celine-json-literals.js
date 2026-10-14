// Strict JSON literals embedded in ordinary script text. Never eval JavaScript.
export function celineJsonLiterals(script){
 if(script.length>2*1024*1024)throw Error('SCRIPT_METADATA_LIMIT');
 const out=[],stack=[];let quote=null,escape=false,attempts=0;
 for(let i=0;i<script.length;i++){
  const c=script[i];if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
  if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
  if(c==='{')stack.push(i);
  if(c==='}'&&stack.length){const start=stack.pop(),text=script.slice(start,i+1);if(text.length>262144||++attempts>2000)throw Error('SCRIPT_METADATA_LIMIT');try{out.push(JSON.parse(text));}catch{}}
 }
 return out;
}
