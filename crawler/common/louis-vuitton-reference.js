import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {downloadAndOptimizeImage,closeImageProcessor} from './image-processor.js';
import {louisVuittonCode,louisVuittonUrl,louisVuittonFamilyUrl} from './louis-vuitton-product.js';
import {louisVuittonBagListFamilies,louisVuittonExplicitBagImages} from './louis-vuitton-metadata.js';
import {prepareCatalogItems,catalogItemFailureKind} from './catalog-workflow.js';
import {verifyCatalogLinkedSource} from './louis-vuitton-catalog-model.js';
const root=path.resolve(import.meta.dirname,'../..');
export async function collectLouisVuittonReference(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('GUARDED_PIPELINE_REQUIRED');
 const args=process.argv.slice(2);if(args.length!==4||args[0]!=='--country-config'||args[2]!=='--batch-offset'||!/^\d+$/.test(args[3]))throw Error('BATCH_SCOPE');
 const cfg=JSON.parse(await fs.readFile(args[1])),run=process.env.CRAWL_RUN_DIR,folder=root+'/crawler/completeness/louis-vuitton/ready-catalog-source';
 if(cfg.brand!=='louis-vuitton'||cfg.country!=='KR'||spawnSync(root+'/scripts/crawl-output-guard.sh',[folder+'/summary.json'],{stdio:'ignore'}).status)throw Error('SOURCE_GUARD');
 const list=JSON.parse(await fs.readFile(folder+'/candidates.json')),offset=Number(args[3]),selected=list.slice(offset,offset+(offset===0?1:cfg.maxProductsPerRun));
 const catalog=root+'/crawler/completeness/louis-vuitton/expanded-catalog-source';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[catalog+'/summary.json'],{stdio:'ignore'}).status)throw Error('CATALOG_SOURCE_GUARD');const anchors=JSON.parse(await fs.readFile(catalog+'/candidates.json'));
 let held={};try{const state=JSON.parse(await fs.readFile(root+'/crawler/runtime/louis-vuitton-browser/workflow.json'));if(state.version!==1)throw Error('WORKFLOW_STATE_GUARD');held=state.ingestHeld??{};}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!selected.length||list.length>cfg.maxCandidates)throw Error('SOURCE_LIMIT');
 await fs.mkdir(run+'/artifacts',{recursive:true});
 const client=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:cfg.navigationTimeoutMs}),records=[],rows=[],categoryCache=new Map();let calls=0,active='SOURCE';
 const row=(status,r)=>({brand:cfg.brand,country:'KR',parentModel:'공식 가방 목록 원본 적재',variantCode:r?.code??active,price:null,currency:'KRW',status,officialUrl:r?.url??cfg.entryUrl});
 try{const batch=await prepareCatalogItems(selected,{held,process:async source=>{active=source.code;const url=louisVuittonUrl(source.url,cfg);
   const linked=source.categoryEvidence==='official_api_model_variant',categorySource=linked?anchors.find(r=>r.code===source.categoryAnchorCode&&r.categoryEvidence!=='official_api_model_variant'):source;if(!categorySource)throw Error('CATEGORY_ANCHOR_IDENTITY');
   let categoryValid=categorySource.categorySource==='https://kr.louisvuitton.com/kor-kr/women/handbags/_/N-tfr7qdp'&&categorySource.categoryEvidence==='official_bag_list_card'||categorySource.categorySource==='https://kr.louisvuitton.com/content/louisvuitton/sitemap/kor_KR/sitemap-image.xml'&&categorySource.categoryEvidence==='explicit_official_image_category'&&louisVuittonExplicitBagImages(categorySource.categoryImages??categorySource.images);
   if(!categoryValid&&categorySource.categoryEvidence==='official_bag_list_card'&&typeof categorySource.categorySourceRun==='string'&&path.dirname(categorySource.categorySourceRun)===root+'/crawler/runs/louis-vuitton/kr'&&/^\d+\.source$/.test(categorySource.categorySourceFile??'')){
    const cacheKey=categorySource.categorySourceRun+'|'+categorySource.categorySourceFile+'|'+categorySource.categorySource;
    if(!categoryCache.has(cacheKey)){
     const proof=categorySource.categorySourceRun+'/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status)throw Error('CATEGORY_SOURCE_GUARD');
     const saved=JSON.parse(await fs.readFile(proof)).filter(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED'),index=Number(categorySource.categorySourceFile.split('.')[0])-1;
     if(saved[index]?.officialUrl!==categorySource.categorySource)throw Error('CATEGORY_SOURCE_IDENTITY');
     const f=categorySource.categorySourceRun+'/raw/'+categorySource.categorySourceFile,stat=await fs.stat(f);if(stat.size>cfg.maxResponseBytes)throw Error('CATEGORY_SOURCE_LIMIT');let html;
     try{await fs.chmod(f,0o600);html=await fs.readFile(f,'utf8');}finally{await fs.chmod(f,stat.mode&0o777);}
     categoryCache.set(cacheKey,louisVuittonBagListFamilies(html,categorySource.categorySource));
    }
    categoryValid=categoryCache.get(cacheKey).has(categorySource.categoryFamily);
   }
   if(linked)categoryValid=categoryValid&&await verifyCatalogLinkedSource(source,categorySource,root,cfg);
   if(louisVuittonCode(url)!==source.code||source.category!=='bag'||!categoryValid||source.categoryFamily!==louisVuittonFamilyUrl(url)||typeof source.name!=='string'||!source.name.trim()||!source.images?.length||source.currency!=='KRW'||!Number.isFinite(source.price)||source.price<=0||!Number.isFinite(Date.parse(source.checkedAt)))throw Error('REFERENCE_IDENTITY');
   const image=new URL(source.images[0].url).href;
   const optimized=await downloadAndOptimizeImage({request:{get:(value,options)=>{if(value!==image||++calls>cfg.maxRequestsPerRun)throw Error('IMAGE_REQUEST_SCOPE');return client.get(value,options).catch(error=>{const text=String(error.message??''),reason=/certificate|SSL|TLS|EPROTO/i.test(text)?'TLS':/ENOTFOUND|EAI_AGAIN|DNS/i.test(text)?'DNS':/disposed|context.*closed/i.test(text)?'CONTEXT':/parse|protocol|header/i.test(text)?'PROTOCOL':/connect|ECONN|socket/i.test(text)?'CONNECTION':'OTHER';rows.push(row('IMAGE_FAILURE_'+reason,source));throw error;});}}},image,run+'/artifacts',source.code);
   const referenceProof={schema:1,exactReferenceVerified:true,classificationEvidenceVerified:true,countryCurrencyVerified:true,brand:cfg.brand,category:'bag',country:'KR',currency:'KRW',code:source.code,officialUrl:url};
   records.push({brand:cfg.brand,category:'bag',country:'KR',currency:'KRW',originalCode:source.code,normalizedCode:source.code,sourceProductId:source.code,styleCode:source.code,modelKey:'sku-'+source.code.toLowerCase(),parentModel:source.name,productName:source.name,price:source.price,priceStatus:'confirmed',officialUrl:url,checkedAt:source.checkedAt,colorOriginal:source.color??null,colorDisplay:source.color??null,materialOriginal:source.material??null,materialDisplay:source.material??null,widthMm:source.widthMm??null,heightMm:source.heightMm??null,depthMm:source.depthMm??null,referenceProof,...optimized});
   rows.push({...row(optimized.maintenancePriceOnly?'REGISTERED_PRICE_READY':'REFERENCE_IMAGE_PRICE_READY',source),price:source.price});
  },onFailure:(e,source)=>rows.push(row(/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'REFERENCE_ITEM_FAILED',source))});
  rows.push(row('SOURCE_TARGETS_'+list.length));rows.push(row('NEXT_OFFSET_'+(offset+selected.length)));rows.push(row('BATCH_FAILED_'+batch.failed));if(batch.failed)process.exitCode=records.length?2:1;if(batch.failed||offset+selected.length<list.length)rows.push(row('FOLLOWUP_REQUIRED'));
 }catch(e){const status=/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:/^[A-Z0-9_]{1,25}$/.test(e.code??'')?'LOCAL_'+e.code:'REFERENCE_PREPARATION_FAILED';rows.push(row(status));process.exitCode=catalogItemFailureKind(e.message)==='safety'?78:1;}
 finally{await fs.mkdir(run+'/artifacts',{recursive:true});await fs.writeFile(run+'/artifacts/records.json',JSON.stringify(records),{mode:0o600});await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});await client.dispose();await closeImageProcessor();}
}
