import {decodeLouisVuitton} from './louis-vuitton-product.js';
// Only links the normal document explicitly publishes, not guessed API routes
// or URLs recovered from JavaScript bundles, credentials, or challenge pages.
export function louisVuittonPublicDataLinks(html, objects, base, allowedHosts=[]) {
 const found = new Map(), origin = new URL(base).origin;
 const publicPath=/catalog|search|products?|records|\.model\.json(?:$|\?)/i;
 const add = (value, kind) => {
  if(typeof value !== 'string' || value.length > 500) return;
  try {
   const u = new URL(decodeLouisVuitton(value), base);
   const api=u.hostname==='api.louisvuitton.com'&&allowedHosts.includes(u.hostname)&&/\/kor-kr(?:\/|$)/.test(u.pathname)&&publicPath.test(u.pathname);
   if(u.protocol !== 'https:' || u.origin !== origin&&!api || u.username || u.password || u.hash || u.port&&u.port!=='443') return;
   if(/auth|token|captcha|challenge|login|logout|account|checkout/i.test(u.pathname)) return;
   if([...u.searchParams.keys()].some(k => !/^(?:page|offset|start|count|locale|q|search|keyword|sku|pid|productId|code|ref|cgid|categoryId|pageSize|sz|format|lang)$/i.test(k))) return;
   if([...u.searchParams.values()].some(v => v.length > 100)) return;
   found.set(u.href, {url: u.href, kind, sourceUrl: base});
  } catch {}
 };
 const attrs = tag => Object.fromEntries([...tag.matchAll(/\b([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
 for(const tag of html.matchAll(/<link\b[^>]*>/gi)) {const a = attrs(tag[0]); if(a.as === 'fetch' && /preload|prefetch/i.test(a.rel ?? '')) add(a.href, 'EXPLICIT_FETCH_LINK');else if(a.type==='application/json'&&/alternate/i.test(a.rel??''))add(a.href,'EXPLICIT_JSON_LINK');}
 for(const tag of html.matchAll(/<form\b[^>]*>/gi)) {const a = attrs(tag[0]); if((a.method ?? 'get').toLowerCase() === 'get' && /search/i.test(a.action ?? '')) add(a.action, 'EXPLICIT_SEARCH_FORM');}
 for(const tag of html.matchAll(/<a\b[^>]*>/gi)) {const a=attrs(tag[0]);if(/\/(?:search|catalog|Search-UpdateGrid|Search-Show|Product-Variation)(?:[/?]|$)|\.model\.json(?:\?|$)/i.test(a.href??''))add(a.href,'EXPLICIT_SEARCH_LINK');}
 for(const tag of html.matchAll(/<[a-z][^>]*>/gi)) for(const [key,value] of Object.entries(attrs(tag[0]))) {
  if(/^data-(?:search|api|catalog|next)(?:-page)?-url$/.test(key))add(value,'EXPLICIT_DATA_ATTRIBUTE');
  if(/^data-(?:url|href)$/.test(key)&&/\/(?:Search-UpdateGrid|Search-Show|Product-Variation)(?:[/?]|$)|\.model\.json(?:\?|$)/i.test(value))add(value,'EXPLICIT_DATA_ATTRIBUTE');
 }
 for(const o of objects) if(o && typeof o === 'object') for(const [key, value] of Object.entries(o)) {
  if(/^(?:nextPageUrl|searchUrl|productListUrl|catalogUrl|dataUrl|apiUrl)$/i.test(key)) add(value, 'EXPLICIT_CATALOG_DATA_LINK');
 }
 return [...found.values()];
}
