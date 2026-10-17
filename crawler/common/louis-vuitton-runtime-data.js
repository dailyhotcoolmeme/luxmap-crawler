// Runs locally or inside an already normal storefront page. Read only public
// catalogue branches, never account/session state, arbitrary getters or cookies.
export function louisVuittonRuntimeData(scope=globalThis){
 const states=[scope?.$nuxt?.$store?.state,scope?.__NUXT__?.state],roots=['product','products','catalog','productCatalog','productList','productPage','plp','pdp','search','searchResults'],out=[],seen=new WeakSet();let nodes=0;
 const own=(o,k)=>{const d=o&&Object.getOwnPropertyDescriptor(o,k);if(!d)return undefined;if(Object.hasOwn(d,'value'))return d.value;if(d.get?.name==='reactiveGetter')try{return d.get.call(o);}catch{}return undefined;};
 const reference=v=>typeof v==='string'&&/^(?:[A-Z]{1,2}\d{4,6}|M\d[A-Z]\d{3})$/.test(v);
 const privateKey=k=>/auth|token|cookie|session|account|customer|user|checkout|payment|address|password|email|phone/i.test(k);
 function pick(v,depth=0){
  if(typeof v==='string')return v.length<=20000?v:undefined;
  if(typeof v==='number')return Number.isFinite(v)?v:undefined;
  if(v===null||typeof v==='boolean')return v;
  if(!v||typeof v!=='object'||depth>3)return undefined;
  if(Array.isArray(v))return v.slice(0,100).map(x=>pick(x,depth+1)).filter(x=>x!==undefined);
  const obj={};for(const k of ['name','value','amount','price','priceCurrency','currency','currencyCode','label','unitText','unitCode','values','width','height','depth']){const x=pick(own(v,k),depth+1);if(x!==undefined)obj[k]=x;}return obj;
 }
 function walk(v,depth=0){
  if(!v||typeof v!=='object'||seen.has(v)||depth>20||++nodes>50000)return;seen.add(v);
  const refs=[...new Set(['sku','mpn','code','productId','id'].map(k=>own(v,k)).filter(reference))];
  if(refs.length===1){const r={sku:refs[0]};for(const k of ['name','description','detailedDescription','color','material','mainMaterial','size','dimensions','width','height','depth','price','priceCurrency','currency','currencyCode','offers','attributes','additionalProperty']){const x=pick(own(v,k));if(x!==undefined)r[k]=x;}if(Object.keys(r).length>1&&out.length<1000)out.push(r);}
  for(const k of Object.keys(v))if(!privateKey(k))walk(own(v,k),depth+1);
 }
 for(const state of states)for(const key of roots)walk(own(state,key));
 const prefetch=scope?.__NUXT__?.data;
 for(const entry of Array.isArray(prefetch)?prefetch.slice(0,100):[prefetch])for(const key of roots)walk(own(entry,key));
 return out;
}
