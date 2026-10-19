import crypto from 'node:crypto';
export const diorLocales={KR:'ko_kr',JP:'ja_jp',FR:'fr_fr',IT:'it_it',ES:'es_es',US:'en_us',SG:'en_sg',HK:'en_hk'};
export const hashUrl=url=>crypto.createHash('sha256').update(url).digest('hex');
export function validateDiorPublishedRoutes(data,country){
 if(data?.schema!==1||data.country!==country||!Array.isArray(data.routes)||data.routes.length>10000)throw Error('PUBLISHED_REGISTRY_SCOPE');
 const seen=new Set();
 for(const r of data.routes){
  const u=new URL(r.url),c=new URL(r.canonical),m=u.pathname.match(/^\/_next\/data\/([A-Za-z0-9_-]{1,100})(\/[a-z]{2}_[a-z]{2}\/fashion\/.+)\.json$/);
  if(u.origin!=='https://www.dior.com'||c.origin!==u.origin||u.search||u.hash||u.username||u.password||c.search||c.hash||c.username||c.password||!m||m[2]!==c.pathname||!c.pathname.startsWith('/'+diorLocales[country]+'/fashion/')||!Number.isFinite(Date.parse(r.observedAt))||!/^[a-f0-9]{64}$/.test(r.responseSha256)||seen.has(r.url))throw Error('PUBLISHED_REGISTRY_IDENTITY');
  seen.add(r.url);
  if(r.proofKind){const control=new URL(r.controlUrl);if(r.proofKind!=='posted-rule-public-canonical'||country!=='KR'||control.origin!==u.origin||control.search||control.hash||!control.pathname.startsWith('/_next/data/'+m[1]+'/ko_kr/fashion/products/'))throw Error('PUBLISHED_RULE_CONTROL');}
 }
 return data.routes;
}
// Keep already verified attributes and the quality-approved original view.
// A different image must go through explicit image review, not silently replace
// a repaired catalogue photo during a price refresh.
export function preserveDiorRegisteredFields(p,v){
 const kr=v?.market_products?.filter(m=>m.country_code==='KR');
 if(v?.normalized_code!==p.normalizedCode||kr?.length!==1||kr[0].official_url!==p.officialUrl||kr[0].official_product_code!==p.normalizedCode)throw Error('REGISTERED_KR_IDENTITY');
 const fields={colorOriginal:'color_original',colorDisplay:'color_ko',materialOriginal:'material_original',materialDisplay:'material_ko',widthMm:'width_mm',heightMm:'height_mm',depthMm:'depth_mm'};
 for(const [k,col] of Object.entries(fields))if(p[k]==null&&v[col]!=null)p[k]=k.endsWith('Mm')?Number(v[col]):v[col];
 const media=v.product_media?.filter(m=>m.is_primary);
 if(media?.length!==1||!media[0].r2_object_key?.includes('/cutout-v1/'))throw Error('REGISTERED_IMAGE_PROOF');
 const prior=new URL(media[0].source_url);prior.search='';prior.hash='';
 const own=p.sourceImageCandidates?.find(url=>{const u=new URL(url);u.search='';u.hash='';return u.href===prior.href;});
 if(!own)throw Error('REGISTERED_IMAGE_VIEW_CHANGED');
 return {...p,sourceImageUrl:own,sourceImageCandidates:[own]};
}
