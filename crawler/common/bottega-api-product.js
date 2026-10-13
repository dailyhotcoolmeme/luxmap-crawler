export function validatedBottegaApiProduct(api, reference, config, allReferences, options={}) {
 const p=api?.product;if(!p)throw Error('PRODUCT_SCOPE_MISSING');
 const normalize=v=>String(v??'').replace(/[^A-Z0-9]/gi,'').toUpperCase(),code=reference.normalizedCode,id=normalize(p.id);
 const explicit=[p.productCode,p.productNumber,p.reference,p.mpn,p.manufacturerCode,p.custom?.productCode].map(normalize).filter(v=>/^[A-Z0-9]{15}$/.test(v));
 if(explicit.some(v=>v!==code))throw Error('MANUFACTURER_REFERENCE_MISMATCH');
 const imageCodes=new Set();let imageNodes=0;
 const images=v=>{if(++imageNodes>5000)throw Error('IMAGE_METADATA_LIMIT');if(typeof v==='string')try{const u=new URL(v);if(u.protocol==='https:'&&u.hostname==='bottega-veneta.dam.kering.com'){const mf=u.pathname.match(/(?:\/|eCom-)([A-Z0-9]{15})_/i)?.[1]?.toUpperCase();if(mf)imageCodes.add(mf);}}catch{}else if(v&&typeof v==='object')Object.values(v).forEach(images);};images(p.images??p.image);
 const supplier=/^\d{8,10}$/.test(id)&&id===reference.sourceProductId&&allReferences.filter(r=>r.sourceProductId===id).length===1;
 if(id!==code&&!supplier)throw Error('EXACT_REFERENCE_UNPROVEN');
 const amount=p.price?.sales,missing=amount==null||amount.value==null||Number(amount.value)===0;
 if((amount?.currency&&amount.currency!==config.currency)||(!missing&&(!Number.isFinite(Number(amount.value))||Number(amount.value)<=0))||(missing&&!options.allowMissingPrice))throw Error('INVALID_PRICE');
 const candidates=new Set();let nodes=0;
 const urls=v=>{if(++nodes>15000)throw Error('URL_METADATA_LIMIT');if(typeof v==='string'){for(const raw of [v,...[...v.matchAll(/(?:href|data-url)=["']([^"']+)["']/gi)].map(m=>m[1])])try{const u=new URL(raw,'https://www.bottegaveneta.com'),path=decodeURIComponent(u.pathname).toUpperCase();if(u.protocol==='https:'&&!u.username&&!u.password&&u.hostname==='www.bottegaveneta.com'&&u.pathname.startsWith(config.localePrefix)&&(path.endsWith(`${code}.HTML`)||(/^\d{8,10}$/.test(reference.sourceProductId??'')&&path.endsWith(`${reference.sourceProductId}.HTML`))))candidates.add(u.href);}catch{}}else if(v&&typeof v==='object')Object.values(v).forEach(urls);};urls(api);
 const preferred=p.selectedProductUrl??api.selectedProductUrl??p.productUrl??p.url;let canonical;try{const u=new URL(preferred,'https://www.bottegaveneta.com');if(candidates.has(u.href))canonical=u.href;}catch{}if(!canonical&&candidates.size===1)canonical=[...candidates][0];if(!canonical)throw Error('CANONICAL_COUNTRY_URL_MISSING');
 // Foreign photographs may be shared across options. Identity comes from the
 // exact KR inventory ID and the official manufacturer-coded buyer URL.
 // A numeric-only buyer URL still needs independent manufacturer evidence.
 if(id!==code&&!decodeURIComponent(new URL(canonical).pathname).toUpperCase().endsWith(`${code}.HTML`)&&!explicit.includes(code)&&!(imageCodes.size===1&&imageCodes.has(code)))throw Error('EXACT_REFERENCE_UNPROVEN');
 return{normalizedCode:code,sourceProductId:reference.sourceProductId,verifiedReference:code,price:missing?null:Number(amount.value),currency:config.currency,country:config.country,officialUrl:canonical};
}
export function publishedBottegaColorOption(api,reference,baseUrl){
 const attrs=api?.product?.variationAttributes;if(!Array.isArray(attrs))return null;
 const urls=new Set();for(const a of attrs)if(['color','colour'].includes(String(a.id??a.attributeId).toLowerCase())&&Array.isArray(a.values))for(const v of a.values)if(String(v.id??v.value)===reference.normalizedCode.slice(-4)&&typeof v.url==='string')try{urls.add(new URL(v.url.replaceAll('&amp;','&'),baseUrl).href);}catch{}
 return urls.size===1?[...urls][0]:null;
}
