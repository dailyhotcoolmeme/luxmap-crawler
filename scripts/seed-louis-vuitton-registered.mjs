import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {validRegisteredLouisVuitton} from '../crawler/common/louis-vuitton-registered.js';
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER)throw Error('COORDINATOR_REQUIRED');
const root=path.resolve(import.meta.dirname,'..'),out=root+'/crawler/completeness/louis-vuitton/registered-reference-source',records=[];
for(let offset=0;offset<10000;offset+=500){const q=new URLSearchParams({select:'id,normalized_code,name_original,brands!inner(slug),market_products(country_code,currency_code,current_price,price_status,official_product_code,official_url),product_media(is_primary,r2_object_key)',active:'eq.true','brands.slug':'eq.louis-vuitton',offset:String(offset),limit:'500',order:'id.asc'});const data=guardedRest('product_variants?'+q,'GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);for(const p of data){const r=validRegisteredLouisVuitton(p);if(r)records.push(r);}if(data.length<500)break;if(offset===9500)throw Error('REGISTERED_PAGE_LIMIT');}
if(!records.length)throw Error('REGISTERED_REFERENCE_REQUIRED');fs.mkdirSync(out,{recursive:true});const bytes=JSON.stringify(records);fs.writeFileSync(out+'/references.json',bytes,{mode:0o600});fs.writeFileSync(out+'/manifest.json',JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),checkedAt:new Date().toISOString()}),{mode:0o600});
fs.writeFileSync(out+'/summary.json',JSON.stringify([{brand:'louis-vuitton',country:'KR',parentModel:'기존 한국 등록 원본누끼 링크 재검증',variantCode:'TOTAL',price:null,currency:'KRW',status:'EXISTING_REGISTERED_VERIFIED_'+records.length,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'}]),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');
