import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from '../crawler/common/louis-vuitton-repair-rest.js';
import {createHash} from 'node:crypto';
import {cleanLouisVuittonName,selectLouisVuittonAttribute} from '../crawler/common/louis-vuitton-metadata.js';
import {readRegisteredLouisVuitton} from '../crawler/common/louis-vuitton-registered.js';
import {louisVuittonCode} from '../crawler/common/louis-vuitton-product.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/completeness/louis-vuitton/catalog-source',out=root+'/crawler/completeness/louis-vuitton/metadata-repair';
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||!process.env.SUPABASE_SERVICE_ROLE_KEY||spawnSync(root+'/scripts/crawl-output-guard.sh',[base+'/summary.json'],{stdio:'ignore'}).status)throw Error('REPAIR_GUARD');
const records=JSON.parse(fs.readFileSync(base+'/candidates.json')),ready=root+'/crawler/completeness/louis-vuitton/ready-catalog-source';
if(fs.existsSync(ready+'/summary.json')){if(spawnSync(root+'/scripts/crawl-output-guard.sh',[ready+'/summary.json'],{stdio:'ignore'}).status)throw Error('READY_SOURCE_GUARD');records.push(...JSON.parse(fs.readFileSync(ready+'/candidates.json')));}
const expanded=root+'/crawler/completeness/louis-vuitton/expanded-catalog-source',sourceMap=new Map(records.map(r=>[r.code,r])),runBase=root+'/crawler/runs/louis-vuitton/kr';
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[expanded+'/summary.json'],{stdio:'ignore'}).status)throw Error('EXPANDED_SOURCE_GUARD');
const available=new Map(JSON.parse(fs.readFileSync(expanded+'/candidates.json')).map(r=>[r.code,r]));
for(const id of fs.readdirSync(runBase)){const file=runBase+'/'+id+'/artifacts/public-verified/summary.json';if(!fs.existsSync(file)||spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)continue;for(const r of JSON.parse(fs.readFileSync(file)))if(r.status==='PUBLIC_CATALOG_VERIFIED'&&!sourceMap.has(r.variantCode)){const source=available.get(r.variantCode);if(!source||source.url!==r.officialUrl)throw Error('IMPORTED_SOURCE_IDENTITY');sourceMap.set(r.variantCode,source);}}
for(const r of readRegisteredLouisVuitton(root))if(!sourceMap.has(r.code)&&typeof r.name==='string'&&r.name.trim())sourceMap.set(r.code,{code:r.code,url:r.url,name:r.name});
records.splice(0,records.length,...sourceMap.values());
if(process.argv.includes('--codes-file')){
 const file=process.argv[process.argv.indexOf('--codes-file')+1];
 if(process.argv.length!==4||file!==root+'/crawler/louis-vuitton-progress/kr/attribute-targets.json')throw Error('ATTRIBUTE_BATCH_SCOPE');
 const codes=JSON.parse(fs.readFileSync(file));if(!Array.isArray(codes)||!codes.length||codes.length>25||new Set(codes).size!==codes.length||codes.some(c=>typeof c!=='string'||!sourceMap.has(c)))throw Error('ATTRIBUTE_BATCH_IDENTITY');
 records.splice(0,records.length,...records.filter(r=>codes.includes(r.code)));
}
if(!records.length||records.length>10000||new Set(records.map(r=>r.code)).size!==records.length)throw Error('REPAIR_SCOPE');
const fieldsDir=root+'/crawler/completeness/louis-vuitton/field-source';let fields=[];
if(fs.existsSync(fieldsDir+'/summary.json')){if(spawnSync(root+'/scripts/crawl-output-guard.sh',[fieldsDir+'/summary.json'],{stdio:'ignore'}).status)throw Error('FIELD_SOURCE_GUARD');fields=JSON.parse(fs.readFileSync(fieldsDir+'/fields.json'));}
const key=process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),publicKey=process.env.EXPO_PUBLIC_SUPABASE_KEY?.trim(),rows=[],api='https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/';let active,operation='INIT';
if(!publicKey||/\s/.test(publicKey))throw Error('PUBLIC_READ_CREDENTIAL_INVALID');
const selectionVersion=createHash('sha256').update(fs.readFileSync(root+'/crawler/common/louis-vuitton-metadata.js')).update('sku-model-attributes-v2').digest('hex');
fs.mkdirSync(out,{recursive:true});let applied={};try{applied=JSON.parse(fs.readFileSync(out+'/applied.json'));}catch(e){if(e.code!=='ENOENT')throw e;}let unchanged=0;
const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},extraHTTPHeaders:{apikey:key,Authorization:'Bearer '+key},timeout:30000});
async function get(route,publicRead=false){operation=publicRead?'PUBLIC_GET':'GET';const response=await client.get(api+route,{maxRedirects:0,headers:publicRead?{apikey:publicKey,Authorization:'Bearer '+publicKey}:{}});if(!response.ok())throw Error('REPAIR_QUERY_FAILED');operation='JSON';return response.json();}
async function patch(route,data){operation='PATCH';const r=await client.patch(api+route,{data,maxRedirects:0});if(!r.ok())throw Error('REPAIR_WRITE_FAILED');}
try{const brands=await get('brands?slug=eq.louis-vuitton&select=id');if(brands.length!==1)throw Error('BRAND_IDENTITY');for(const source of records){active=source;const name=cleanLouisVuittonName(source.name);if(louisVuittonCode(source.url)!==source.code)throw Error('REFERENCE_IDENTITY');const attributes=fields.filter(f=>f.code===source.code),signature=createHash('sha256').update(JSON.stringify({selectionVersion,name,url:source.url,attributes})).digest('hex');if(applied[source.code]===signature){unchanged++;continue;}const startRow=rows.length;
 const v=await get('product_variants?brand_id=eq.'+brands[0].id+'&normalized_code=eq.'+source.code+'&select=id,model_id,name_ko,market_products(id,country_code,currency_code,official_product_code,current_price,price_checked_at,official_url)');if(!v.length)continue;if(v.length!==1)throw Error('VARIANT_IDENTITY');const kr=v[0].market_products.filter(m=>m.country_code==='KR');if(kr.length!==1||kr[0].official_url!==source.url||kr[0].official_product_code!==source.code||kr[0].currency_code!=='KRW')throw Error('MARKET_IDENTITY');
 const variantPatch={name_ko:name,name_original:name};
 for(const [key,column] of [['color','color_ko'],['material','material_ko'],['widthMm','width_mm'],['heightMm','height_mm'],['depthMm','depth_mm']]){const selected=selectLouisVuittonAttribute(attributes,key);if(selected.conflict){rows.push({brand:'louis-vuitton',country:'KR',parentModel:'충돌 속성 보존 및 다른 상품 계속',variantCode:source.code,price:null,currency:'KRW',status:'ATTRIBUTE_CONFLICT_PRESERVED',officialUrl:source.url});continue;}if(selected.value!==undefined){variantPatch[column]=selected.value;if(key==='color')variantPatch.color_original=selected.value;if(key==='material')variantPatch.material_original=selected.value;}}
 await patch('product_variants?id=eq.'+v[0].id+'&brand_id=eq.'+brands[0].id,variantPatch);await patch('product_models?id=eq.'+v[0].model_id+'&brand_id=eq.'+brands[0].id,{name_ko:name,name_original:name});
 const allPrices=fields.filter(f=>f.code===source.code&&f.currency==='KRW'&&Number.isFinite(f.price)&&f.price>0&&Number.isFinite(Date.parse(f.checkedAt))),latest=Math.max(...allPrices.map(f=>Date.parse(f.checkedAt)));
 const same=allPrices.filter(f=>Date.parse(f.checkedAt)===latest);
 if(new Set(same.map(f=>f.price)).size>1)throw Error('SOURCE_PRICE_CONFLICT');const field=same[0],market={official_name:name};
 if(field&&(!kr[0].price_checked_at||Date.parse(kr[0].price_checked_at)<=Date.parse(field.checkedAt))){
  const historyRoute='price_history?market_product_id=eq.'+kr[0].id+'&amount=eq.'+field.price+'&observed_at=eq.'+encodeURIComponent(field.checkedAt)+'&select=id';
  const prior=await get(historyRoute);if(!prior.length){const added=await client.post(api+'price_history',{data:{market_product_id:kr[0].id,amount:field.price,currency_code:'KRW',observed_at:field.checkedAt,source_url:source.url},maxRedirects:0});if(!added.ok())throw Error('PRICE_HISTORY_APPEND_FAILED');}
  if(!(await get(historyRoute,true)).length)throw Error('PUBLIC_PRICE_HISTORY_FAILED');
  Object.assign(market,{current_price:field.price,price_status:'confirmed',price_checked_at:field.checkedAt});
 }
 await patch('market_products?id=eq.'+kr[0].id,market);
 const checked=await get('product_variants?id=eq.'+v[0].id+'&select=name_ko,name_original,color_ko,color_original,material_ko,material_original,width_mm,height_mm,depth_mm,product_models(name_ko),market_products(country_code,official_name)',true);if(checked.length!==1||checked[0].name_ko!==name||checked[0].name_original!==name||checked[0].product_models.name_ko!==name||checked[0].market_products.find(m=>m.country_code==='KR')?.official_name!==name)throw Error('PUBLIC_NAME_VERIFY_FAILED');
 for(const [column,value] of Object.entries(variantPatch))if(typeof value==='number'?Number(checked[0][column])!==value:checked[0][column]!==value)throw Error('PUBLIC_ATTRIBUTE_VERIFY_FAILED');
 rows.push({brand:'louis-vuitton',country:'KR',parentModel:'상품명 정정 공개 검증',variantCode:source.code,price:null,currency:'KRW',status:'CLEAN_PRODUCT_NAME_PUBLIC_VERIFIED',officialUrl:source.url});
 if(market.current_price!==undefined){const saved=await get('market_products?id=eq.'+kr[0].id+'&select=current_price,price_status,price_checked_at',true);if(saved.length!==1||Number(saved[0].current_price)!==field.price||saved[0].price_status!=='confirmed'||Date.parse(saved[0].price_checked_at)!==Date.parse(field.checkedAt))throw Error('PUBLIC_PRICE_VERIFY_FAILED');rows.push({brand:'louis-vuitton',country:'KR',parentModel:'실제 과거 정상 응답 가격 복원',variantCode:source.code,price:field.price,currency:'KRW',status:'KR_PRICE_HISTORY_PUBLIC_VERIFIED',officialUrl:source.url});}
 const proofDir=out+'/products/'+source.code;fs.mkdirSync(proofDir,{recursive:true});fs.writeFileSync(proofDir+'/summary.json',JSON.stringify(rows.slice(startRow)),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[proofDir+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');applied[source.code]=signature;fs.writeFileSync(out+'/applied.json.tmp',JSON.stringify(applied),{mode:0o600});fs.renameSync(out+'/applied.json.tmp',out+'/applied.json');
}}catch(e){const text=String(e.message),kind=/header|expected string/i.test(text)?'HEADER':/certificate|ssl|tls/i.test(text)?'TLS':/timeout|timed out/i.test(text)?'TIMEOUT':/ECONNRESET|socket hang up|closed|reset/i.test(text)?'CONNECTION':e instanceof TypeError?'TYPE':e instanceof SyntaxError?'JSON':'OTHER';rows.push({brand:'louis-vuitton',country:'KR',parentModel:'상품명 정정 공개 검증',variantCode:active?.code??'SOURCE',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(text)?text:'REPAIR_'+operation+'_'+kind+'_FAILED',officialUrl:active?.url??'https://kr.louisvuitton.com/kor-kr/homepage'});process.exitCode=1;}
finally{await client.dispose();fs.mkdirSync(out,{recursive:true});
 rows.push({brand:'louis-vuitton',country:'KR',parentModel:'이미 공개 검증한 동일 근거 재사용',variantCode:'TOTAL',price:null,currency:'KRW',status:'UNCHANGED_VERIFIED_'+unchanged,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'});
 for(let i=0;i<rows.length;i+=40){const dir=out+'/batches/'+String(i/40).padStart(4,'0');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/summary.json',JSON.stringify(rows.slice(i,i+40)),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');}
 const result=rows.length<=80?rows:[...new Set(rows.map(r=>r.status))].map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'속성 정정 전체 결과',variantCode:'TOTAL',price:null,currency:'KRW',status:status.slice(0,32)+'_'+rows.filter(r=>r.status===status).length,officialUrl:'https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp'}));
 fs.writeFileSync(out+'/summary.json',JSON.stringify(result),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('OUTPUT_GUARD');}
