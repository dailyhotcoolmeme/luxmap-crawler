import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {auditOfficialReferenceCatalog} from './audit-official-reference.mjs';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..'),folder=root+'/crawler/completeness/dior/weekly-audit';fs.mkdirSync(folder,{recursive:true});
// Preserve the independent whole-discovery audit. Missing global receipts
// remain incomplete; they do not invalidate already registered price targets.
const independent=await auditOfficialReferenceCatalog({brand:'dior'}),refs=JSON.parse(fs.readFileSync(root+'/crawler/runtime/dior-weekly/references.json'));
let verified=0;for(let offset=0;offset<refs.length;offset+=25){const codes=refs.slice(offset,offset+25).map(v=>v.normalized_code),rows=guardedRest('product_variants?brands.slug=eq.dior&normalized_code=in.('+codes.join(',')+')&select=normalized_code,brands!inner(slug),market_products(country_code,currency_code,official_product_code,current_price),product_media(is_primary,r2_object_key)&limit=25','GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);if(rows.length!==codes.length||rows.some(v=>v.brands?.slug!=='dior'||v.market_products.filter(m=>m.country_code==='KR'&&m.currency_code==='KRW'&&m.official_product_code===v.normalized_code&&m.current_price>0).length!==1||v.product_media.filter(m=>m.is_primary&&m.r2_object_key?.includes('/cutout-v1/')).length!==1))throw Error('PUBLIC_REGISTERED_AUDIT_FAILED');verified+=rows.length;}
const statuses=['REGISTERED_PUBLIC_VERIFIED_'+verified,independent.complete?'INDEPENDENT_DISCOVERY_VERIFIED':'DISCOVERY_AUDIT_REQUIRED'];
const file=folder+'/summary.json';fs.writeFileSync(file,JSON.stringify(statuses.map(status=>({brand:'dior',country:'KR',parentModel:'독립 전체발견과 익명 등록 범위 대조',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://www.dior.com/ko_kr/fashion'}))));
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('AUDIT_GUARD');process.exitCode=independent.complete?0:2;
