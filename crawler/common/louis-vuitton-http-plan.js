import {louisVuittonCode} from './louis-vuitton-product.js';
import {selectLouisVuittonAttribute} from './louis-vuitton-metadata.js';

// Price-ready is not attribute-complete. Actual requests remain constrained
// by the existing per-URL refusal and completed-source journals below.
export function louisVuittonResolvedDetails(fields,held={}){
 const groups=new Map();for(const f of fields){if(!groups.has(f.code))groups.set(f.code,[]);groups.get(f.code).push(f);}
 return new Set([...groups].filter(([code,items])=>!held[code]&&items.some(f=>f.currency==='KRW'&&f.price>0)&&['color','material','widthMm','heightMm','depthMm'].every(key=>selectLouisVuittonAttribute(items,key).value!==undefined)).map(([code])=>code));
}

// Exact published product URLs only. Query/hash variants cannot reset an
// attempt, and a new local parser cannot reset a refused HTTP detail pass.
export function nextLouisVuittonDetail(candidates,priced,runs,attempted){
 const canonical=value=>{try{const u=new URL(value);if(u.origin!=='https://kr.louisvuitton.com'||u.username||u.password||!u.pathname.startsWith('/kor-kr/products/'))return null;u.search='';u.hash='';return u.href;}catch{return null;}};
 const seen=new Set(),normal=new Set(),rendered=new Set();let httpNormal=0,httpDenied=0;
 for(const run of runs)for(const row of run.rows){
  if(['LV 공식 SKU 상품 모델 연결','공식 가방 목록 원본 적재'].includes(row.parentModel))continue;
  const url=canonical(row.officialUrl);if(!url)continue;
  seen.add(url);
  if(row.status==='NORMAL_HTTP_DOCUMENT_SAVED'&&row.parentModel!=='LV 공식 SKU 상품 모델 연결'){normal.add(url);httpNormal=Math.max(httpNormal,run.time??0);}
  if(/NORMAL_RENDERED_DOCUMENT_SAVED|DENIED|BLOCKED|SECURITY_VERIFICATION|FAILED|ALREADY_ATTEMPTED/.test(row.status))rendered.add(url);
  if(/ACCESS_BLOCKED|ACCESS_DENIED|HTTP_40[13]|HTTP_429/.test(row.status)&&!run.rows.some(r=>r.status==='BROWSER_SESSION_PRESERVED'))httpDenied=Math.max(httpDenied,run.time??0);
 }
 const valid=candidates.filter(r=>{const url=canonical(r.url);return url&&url===r.url&&louisVuittonCode(url)===r.code&&!priced.has(r.code);});
 const ready=valid.find(r=>normal.has(r.url)&&!rendered.has(r.url)&&!attempted('render',r.url));
 if(ready)return {kind:'render',candidate:ready};
 if(httpDenied>=httpNormal&&httpDenied>0)return null;
 const fresh=valid.find(r=>!seen.has(r.url)&&!attempted('http',r.url));
 return fresh?{kind:'http',candidate:fresh}:null;
}

export function nextLouisVuittonHttpCategory(categories,runs,normalTime,attempted){
 const family=url=>{const m=url.match(/^https:\/\/kr\.louisvuitton\.com\/kor-kr\/(men\/bags|women\/handbags)\/([^/]+)\//);return m?m[1]+'/'+m[2]:undefined;};
 const latestNormal=new Map();
 for(const s of runs)for(const r of s.rows)if(r.status==='NORMAL_RENDERED_DOCUMENT_SAVED'&&family(r.officialUrl))latestNormal.set(family(r.officialUrl),Math.max(latestNormal.get(family(r.officialUrl))??0,s.time));
 // A new women's page cannot reset a men's refusal (or vice versa).
 const denied=new Set(runs.flatMap(s=>s.rows.filter(r=>/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status)&&s.time>=(latestNormal.get(family(r.officialUrl))??0)).map(r=>family(r.officialUrl))).filter(Boolean));
 return categories.find(r=>r.status==='EXPLICIT_KR_BAG_CATEGORY'&&!denied.has(family(r.officialUrl))&&!attempted(r.officialUrl)&&!runs.some(s=>s.rows.some(row=>row.officialUrl===r.officialUrl)))??null;
}
export function nextLouisVuittonRenderCategory(proofs,runs,attempted){
 const normal=new Set(),visited=new Set();
 for(const run of runs)for(const row of run.rows){
  if(row.status==='NORMAL_HTTP_DOCUMENT_SAVED'&&row.parentModel!=='LV 공식 SKU 상품 모델 연결')normal.add(row.officialUrl);
  if(/^(?:NORMAL_RENDERED_DOCUMENT_SAVED|ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION|SOURCE_HTTP_FAILED|PUBLISHED_SOURCE_FAILED|PUBLISHED_SOURCE_ALREADY_ATTEMPTED)$/.test(row.status))visited.add(row.officialUrl);
 }
 return proofs.find(r=>['EXPLICIT_KR_BAG_CATEGORY','UNVISITED_PUBLISHED_BAG_LIST'].includes(r.status)&&normal.has(r.officialUrl)&&!visited.has(r.officialUrl)&&!attempted(r.officialUrl))??null;
}
