export function resolveBottegaListingReference(tile, references) {
 const sku=String(tile.sku??'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
 const url=new URL(tile.url),last=decodeURIComponent(url.pathname).split('/').at(-1).toUpperCase();
 if(/^[A-Z0-9]{15}$/.test(sku))return last.endsWith(`${sku}.HTML`)?sku:null;
 if(!/^\d{8,10}$/.test(sku))return null;
 const matched=references.filter(r=>r.sourceProductId===sku);
 if(matched.length!==1)return null;
 const code=matched[0].normalizedCode;
 return last.endsWith(`${code}.HTML`)||last.endsWith(`${sku}.HTML`)?code:null;
}
