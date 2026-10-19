import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..'),out=root+'/crawler/completeness/louis-vuitton/weekly-audit';
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER||process.argv[2]!=='kr')throw Error('AUDIT_SCOPE');
const refs=[],published=[];
for(let offset=0;offset<10000;offset+=500){const page=guardedRest('rpc/crawler_korean_references?limit=500&offset='+offset,'POST',{p_brand:'louis-vuitton'});refs.push(...page);if(page.length<500)break;if(offset===9500)throw Error('AUDIT_REFERENCE_LIMIT');}
// The reference RPC is service-only. Read the normal public tables with the
// anonymous role rather than granting a new public RPC permission.
for(let offset=0;offset<10000;offset+=500){const page=guardedRest('product_variants?brands.slug=eq.louis-vuitton&select=id,normalized_code,brands!inner(slug),market_products(country_code,official_product_code,official_url)&order=normalized_code,id&limit=500&offset='+offset,'GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);for(const v of page)for(const m of v.market_products.filter(m=>m.country_code==='KR')){if(m.official_product_code!==v.normalized_code)throw Error('PUBLIC_REGISTERED_AUDIT_FAILED');published.push({id:v.id,normalized_code:v.normalized_code,official_url:m.official_url});}if(page.length<500)break;if(offset===9500)throw Error('AUDIT_REFERENCE_LIMIT');}
const canonical=rows=>rows.map(r=>JSON.stringify([r.id,r.normalized_code,r.official_url])).sort();
if(!refs.length||JSON.stringify(canonical(refs))!==JSON.stringify(canonical(published)))throw Error('PUBLIC_REGISTERED_AUDIT_FAILED');
// A fresh independent discovery/public/snapshot proof is still mandatory.
// Registered DB rows alone can never attest the whole official catalogue.
const base=root+'/crawler/completeness/louis-vuitton',required=['public-reference','expanded-catalog-source','ready-catalog-source','catalog-audit'];
const fresh=required.every(folder=>{const f=base+'/'+folder+'/summary.json';if(!fs.existsSync(f))return false;const age=Date.now()-fs.statSync(f).mtimeMs;return age>=0&&age<=86400000&&spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status===0;});
const complete=fresh&&spawnSync(process.execPath,[root+'/scripts/check-louis-vuitton-completion.mjs'],{cwd:root,env:process.env,stdio:'ignore'}).status===0;
const rows=['REGISTERED_KR_REFERENCES_'+refs.length,complete?'FULL_CATALOG_AUDIT_VERIFIED':'DISCOVERY_AUDIT_REQUIRED',complete?'CATALOG_COMPLETE':fresh?'CATALOG_NOT_COMPLETE':'FRESH_DISCOVERY_PROOF_MISSING'].map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'주간 독립 전체발견 감사 상태',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'}));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('AUDIT_OUTPUT_GUARD');process.exitCode=complete?0:2;
