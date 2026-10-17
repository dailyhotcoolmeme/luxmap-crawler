// Read-only accounting. A persisted price is not a refresh in this execution.
export const progressCountries=['kr','jp','fr','it','es','us','sg','hk'];
const positive=v=>v!==null&&Number.isFinite(Number(v))&&Number(v)>0;
const text=v=>typeof v==='string'&&v.trim()&&!/^(?:미확인|알 수 없음|unknown|n\/a|-)$/i.test(v.trim());
const fresh=(value,start,end)=>Number.isFinite(Date.parse(value))&&Date.parse(value)>=start&&Date.parse(value)<=end;
function marketFor(product,cfg){
 const matches=product.market_products?.filter(m=>m.country_code===cfg.country)??[];
 if(matches.length!==1)return null;
 const m=matches[0];if(m.official_product_code!==product.normalized_code||m.currency_code!==cfg.currency)return null;
 try{const u=new URL(m.official_url),prefix=cfg.localePrefix??cfg.referenceDetailPrefix;
  const hosts=cfg.siteHosts??[new URL(cfg.entryUrl??cfg.listingUrls[0]).hostname];
  if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search||!hosts.includes(u.hostname)||prefix&&!u.pathname.startsWith(prefix))return null;
  if(cfg.brand==='louis-vuitton'&&u.pathname.replace(/\/$/,'').split('/').at(-1)!==product.normalized_code)return null;
 }catch{return null;}return m;
}
export function catalogProgress(products,configs,{brand,startedAt,now=new Date().toISOString()}){
 const start=Date.parse(startedAt),end=Date.parse(now);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Error('PROGRESS_TIME_SCOPE');
 if(!Array.isArray(products)||products.length>10000||new Set(products.map(p=>p.normalized_code)).size!==products.length)throw Error('PROGRESS_PRODUCT_SCOPE');
 const reference=products.filter(p=>marketFor(p,configs.kr));
 const hasImage=p=>{const media=p.product_media?.filter(m=>m.is_primary)??[];return media.length===1&&typeof media[0].r2_object_key==='string'&&media[0].r2_object_key.startsWith('products/'+brand+'/')&&media[0].r2_object_key.includes('/'+p.normalized_code+'/cutout-v1/')&&/[a-f0-9]{64}\.webp$/.test(media[0].r2_object_key);};
 const attrs=p=>[p.name_ko,p.material_ko,p.color_ko].every(text)&&[p.width_mm,p.height_mm,p.depth_mm].every(positive);
 const countries=progressCountries.map(country=>{const cfg=configs[country];if(!cfg||cfg.country!==country.toUpperCase())throw Error('PROGRESS_COUNTRY_SCOPE');let confirmed=0,refreshed=0;
  for(const p of reference){const m=marketFor(p,cfg);if(!m||m.price_status!=='confirmed'||!positive(m.current_price))continue;confirmed++;if(fresh(m.price_checked_at,start,end))refreshed++;}
  return {country:cfg.country,currency:cfg.currency,total:reference.length,confirmed,refreshed,pending:reference.length-refreshed,unconfirmed:reference.length-confirmed};
 });
 const times=reference.flatMap(p=>progressCountries.map(c=>marketFor(p,configs[c])?.price_checked_at)).filter(v=>Number.isFinite(Date.parse(v))&&Date.parse(v)<=end).map(Date.parse);
 return {brand,startedAt,checkedAt:now,lastPriceCheckedAt:times.length?new Date(times.reduce((a,b)=>Math.max(a,b),0)).toISOString():null,registered:products.length,total:reference.length,referenceMismatch:products.length-reference.length,countries,
  attributes:{name:reference.filter(p=>text(p.name_ko)).length,color:reference.filter(p=>text(p.color_ko)).length,material:reference.filter(p=>text(p.material_ko)).length,dimensions:reference.filter(p=>[p.width_mm,p.height_mm,p.depth_mm].every(positive)).length,complete:reference.filter(attrs).length},
  currentIntegrated:reference.filter(p=>{const m=marketFor(p,configs.kr),image=p.product_media?.find(m=>m.is_primary);return attrs(p)&&hasImage(p)&&fresh(m.price_checked_at,start,end)&&fresh(image?.source_checked_at,start,end);}).length};
}
export function progressRows(p,configs){
 const row=(country,status)=>({brand:p.brand,country:configs[country].country,parentModel:'실행별 공개 상품 진행 집계',variantCode:'TOTAL',price:null,currency:configs[country].currency,status,officialUrl:configs[country].entryUrl??configs[country].listingUrls[0]});
 const rows=p.countries.flatMap(c=>[['REGISTERED_KR_SCOPE_',c.total],['THIS_RUN_PRICE_CHECKED_',c.refreshed],['THIS_RUN_PENDING_',c.pending],['PUBLIC_PRICE_CONFIRMED_',c.confirmed],['PUBLIC_PRICE_UNCONFIRMED_',c.unconfirmed]].map(([s,n])=>row(c.country.toLowerCase(),s+n)));
 for(const [k,v] of Object.entries(p.attributes))rows.push(row('kr','PUBLIC_ATTRIBUTE_'+k.toUpperCase()+'_'+v));
 rows.push(row('kr','THIS_RUN_INTEGRATED_'+p.currentIntegrated),row('kr','REFERENCE_MISMATCH_'+p.referenceMismatch));return rows;
}
export function collectorState(run,jobs){
 const job=jobs.find(j=>j.name==='crawl');
 if(job?.status==='completed')return {finished:true,status:job.conclusion??'unknown',stage:'수집 실행 종료'};
 if(run.status==='completed')return {finished:true,status:run.conclusion??'unknown',stage:'실행 종료'};
 const active=job?.steps?.find(s=>s.status==='in_progress');
 return {finished:false,status:run.status,stage:active?.name??'수집 실행 대기'};
}
export function progressMarkdown(items,state,runUrl){
 const lines=[`## 카탈로그 수집 진행 — ${state.finished?'종료':'실행 중'}`,`수집 상태: **${state.status}** · 단계: ${state.stage}`,`[원래 수집 실행](${runUrl})`,
  '', '공개 DB를 읽기 전용으로 집계합니다. 이번 확인은 실행 시작 이후 가격 확인 시각이 갱신된 SKU입니다. 기존 저장 수와 구분합니다. 전체 발견 완료율은 아닙니다.',''];
 for(const p of items){lines.push(`### ${p.brand}`,`집계 시각: ${p.checkedAt} · 실행 시작: ${p.startedAt}`,`마지막 공개 가격 확인 시각: ${p.lastPriceCheckedAt??'없음'}`,
  ...(p.countries.every(c=>c.refreshed===0)&&Date.parse(p.checkedAt)-Date.parse(p.startedAt)>=15*60*1000?['**주의: 실행 시작 후 공개 가격 확인 갱신이 없습니다. 준비·발견 단계인지 정체인지 수집 실행을 확인해야 합니다.**']:[]),'',
  '| 국가 | 한국 등록 기준 | 이번 가격 확인 | 이번 미확인 | 공개 가격 누적 | 공개 가격 미확인 |','|---|---:|---:|---:|---:|---:|',
  ...p.countries.map(c=>`| ${c.country} | ${c.total} | ${c.refreshed} | ${c.pending} | ${c.confirmed} | ${c.unconfirmed} |`),'',
  `한국 공개 속성: 이름 ${p.attributes.name} · 색상 ${p.attributes.color} · 소재 ${p.attributes.material} · 세 치수 ${p.attributes.dimensions} · 모두 완비 ${p.attributes.complete} / ${p.total}`,
  `이번 실행 가격·이미지 재확인 및 공개 필드 완비: ${p.currentIntegrated} / ${p.total} · 한국 참조 불일치: ${p.referenceMismatch}`,'');
 }
 lines.push('미확인을 실패나 미판매로 단정하지 않습니다. SKU별 수집 실패는 원래 실행의 최종 guarded-summary 진단과 구분하며, 실행 failure/cancelled/timed_out은 위 상태에 표시됩니다.');
 return lines.join('\n');
}
