// A price object inherits identity only from its enclosing exact-SKU product.
export function louisVuittonNestedKrw(offer,code){
 const price=offer?.price;if(!price||typeof price!=='object'||Array.isArray(price))return null;
 for(const node of [offer,price])for(const key of ['sku','mpn','code'])if(node[key]!==undefined&&String(node[key]).trim().toUpperCase()!==code)return null;
 const currencies=[offer.priceCurrency,offer.currency,offer.currencyCode,price.priceCurrency,price.currency,price.currencyCode].filter(v=>v!==undefined&&v!==null);
 if(!currencies.length||currencies.some(v=>v!=='KRW'))return null;
 const values=[price.value,price.amount,price.price].filter(v=>v!==undefined&&v!==null);
 if(!values.length||values.some(v=>!['string','number'].includes(typeof v)||!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(String(v))))return null;
 const numbers=values.map(v=>Number(String(v).replaceAll(',','')));
 return new Set(numbers).size===1&&Number.isSafeInteger(numbers[0])&&numbers[0]>0?numbers[0]:null;
}
