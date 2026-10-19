import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..');
if(process.env.LUXURY_SERVICE_GUARD!=='enabled')throw Error('COORDINATED_SAMPLE_REQUIRED');
const brands=['chanel','prada','bottega-veneta','van-cleef-arpels','rolex'],report=[];
for(const brand of brands){
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries/kr')));
 let row;
 try{
  const base=path.join(root,'crawler/runs',brand,'kr'),run=path.join(base,fs.readdirSync(base).sort().at(-1)),summary=path.join(run,'summary.json');
  if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[summary],{stdio:'ignore'}).status!==0||fs.statSync(summary).mtimeMs<Date.now()-3600000)throw Error('SAMPLE_NOT_FRESH');
  const file=path.join(run,'artifacts/records.json'),mode=fs.statSync(file).mode&0o777;let records;
  try{fs.chmodSync(file,0o600);records=JSON.parse(fs.readFileSync(file));}finally{fs.chmodSync(file,mode);}
  if(records.length!==1)throw Error('SAMPLE_SIZE_NOT_ONE');row=records[0];
  const code=row.normalizedCode.toUpperCase(),brandRow=guardedRest(`brands?slug=eq.${brand}&select=id`)[0];
  const products=guardedRest(`product_variants?brand_id=eq.${brandRow.id}&normalized_code=eq.${code}&select=id,active,market_products(id,country_code,currency_code,current_price,official_product_code,official_url,price_checked_at),product_media(is_primary,sha256,r2_object_key,width,height)`, 'GET',undefined,process.env.EXPO_PUBLIC_SUPABASE_KEY);
  const product=products[0],market=product?.market_products?.find(m=>m.country_code==='KR'),media=product?.product_media?.find(m=>m.is_primary&&(row.maintenancePriceOnly||m.sha256===row.imageSha256));
  if(products.length!==1||!product.active||!market||market.currency_code!=='KRW'||market.official_product_code!==code||market.official_url!==row.officialUrl||row.price==null||Number(market.current_price)!==row.price||Date.parse(market.price_checked_at)<Date.parse(row.checkedAt))throw Error('SAMPLE_PUBLIC_PRICE_MISMATCH');
  const history=guardedRest(`price_history?market_product_id=eq.${market.id}&select=amount,currency_code&order=observed_at.desc&limit=1`)[0];
  if(!history||Number(history.amount)!==row.price||history.currency_code!=='KRW')throw Error('SAMPLE_HISTORY_MISMATCH');
  if(row.maintenancePriceOnly){const f=path.join(run,'artifacts/registered-price-verified/summary.json');if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status||!JSON.parse(fs.readFileSync(f)).some(p=>p.variantCode===code&&p.status==='REGISTERED_PRICE_PUBLIC_VERIFIED'&&p.price===row.price&&p.officialUrl===row.officialUrl))throw Error('SAMPLE_PRICE_ONLY_PROOF_REQUIRED');}
  if(!media||media.width!==960||media.height!==960||!row.maintenancePriceOnly&&row.imageProcessingVersion!=='original-cutout-v1')throw Error('SAMPLE_IMAGE_MISMATCH');
  const imageUrl='https://luxury-assets.dailyhotcoolmeme.workers.dev/media/'+media.r2_object_key.split('/').map(encodeURIComponent).join('/');
  const bytes=execFileSync(process.execPath,[path.join(root,'scripts/network-isolate.mjs'),'["luxury-assets.dailyhotcoolmeme.workers.dev"]','0','/usr/bin/curl','-fsS','--max-time','30',imageUrl],{env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdio:['ignore','pipe','pipe'],maxBuffer:4194304,timeout:35000});
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==media.sha256)throw Error('SAMPLE_R2_HASH_MISMATCH');
  const availability=guardedRest(`catalog_availability_state?variant_id=eq.${product.id}&select=state,last_checked_at,source_run`)[0];
  if(availability?.state!=='available'||availability.source_run!==path.basename(run))throw Error('SAMPLE_AVAILABILITY_MISMATCH');
  report.push({brand,country:'KR',parentModel:row.parentModel?.slice(0,120)??'표본 공개 적재 검증',variantCode:code,price:row.price,currency:'KRW',status:'SAMPLE_PRICE_HISTORY_IMAGE_VERIFIED',officialUrl:row.officialUrl});
 }catch(error){process.exitCode=1;report.push({brand,country:'KR',parentModel:'표본 검증 실패',variantCode:row?.normalizedCode??'RUN',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(error.message)?error.message:'SAMPLE_VERIFICATION_FAILED',officialUrl:row?.officialUrl??cfg.entryUrl??cfg.listingUrls[0]});}
}
const file=path.join(root,'crawler/service/weekly-samples/summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report),{mode:0o600});if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status!==0)throw Error('SUMMARY_BLOCKED');
