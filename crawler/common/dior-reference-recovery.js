import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {request} from 'playwright-core';
import {parseOfficialProduct} from './dior-official-core.js';
import {downloadAndOptimizeImage,closeImageProcessor} from './image-processor.js';

export async function recoverDiorReference(){
 const args=process.argv.slice(2),root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR;
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||args.length!==4||args[2]!=='--recover-source-run')throw Error('RECOVERY_GUARD');
 const cfg=JSON.parse(await fs.readFile(args[1])),source=path.resolve(args[3]);
 if(cfg.brand!=='dior'||cfg.country!=='KR'||!source.startsWith(root+'/crawler/runs/dior/kr/')||await fs.realpath(source)!==source||Date.now()-(await fs.stat(source)).mtimeMs>86400000)throw Error('RECOVERY_SCOPE');
 if(spawnSync(root+'/scripts/crawl-output-guard.sh',[source+'/summary.json'],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');
 const accepted=JSON.parse(await fs.readFile(source+'/summary.json')).filter(r=>r.status==='EXACT_SKU');
 if(!accepted.length||accepted.length>25)throw Error('RECOVERY_BATCH_LIMIT');
 const inputs=[];
 for(const name of (await fs.readdir(source+'/raw')).filter(n=>/^\d+\.source$/.test(n))){
  const file=source+'/raw/'+name,stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>cfg.maxResponseBytes)throw Error('SOURCE_LIMIT');
  let html;try{await fs.chmod(file,0o600);html=await fs.readFile(file,'utf8');}finally{await fs.chmod(file,stat.mode&0o777);}
  for(const row of accepted){
   let product;try{product=parseOfficialProduct(html,row.officialUrl,cfg,row.variantCode,{handbagEvidence:true});}catch{continue;}
   // Category links can include global navigation: independently require an
   // explicit bag type in the official product name before issuing a proof.
   if(!/(?:\s백(?:\s|$)|토트|숄더|핸드백|크로스백|백팩|보스턴|호보|tote|handbag|shoulder bag|backpack)/i.test(product.productName)||/(?:스트랩|참|strap|charm)\s*$/i.test(product.productName))throw Error('BAG_CLASSIFICATION_UNRESOLVED');
   if(product.price!==row.price||inputs.some(p=>p.normalizedCode===product.normalizedCode))throw Error('RECOVERY_IDENTITY');
   product.referenceProof={schema:1,exactReferenceVerified:true,classificationEvidenceVerified:true,countryCurrencyVerified:true,brand:'dior',category:'bag',country:'KR',currency:'KRW',code:product.normalizedCode,officialUrl:product.officialUrl};inputs.push(product);
  }
 }
 if(inputs.length!==accepted.length)throw Error('RECOVERY_SOURCE_MISSING');
 const rows=[],records=[],artifact=run+'/artifacts';await fs.mkdir(artifact,{recursive:true});
 const context=await request.newContext({proxy:{server:process.env.LUXURY_NETWORK_PROXY},timeout:30000});let active=null,calls=0;
 try{for(const product of inputs){active=product;
  const image=await downloadAndOptimizeImage({request:{get:async(url,options)=>{if(++calls>cfg.maxRequestsPerRun)throw Error('REQUEST_LIMIT');return context.get(url,options);}}},product.sourceImageUrl,artifact,product.normalizedCode);
  records.push({...product,...image});rows.push({brand:'dior',country:'KR',parentModel:product.productName,variantCode:product.normalizedCode,price:product.price,currency:'KRW',status:'REFERENCE_IMAGE_READY',officialUrl:product.officialUrl});
  await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
 }}catch(e){rows.push({brand:'dior',country:'KR',parentModel:'',variantCode:active?.normalizedCode??'RUN',price:null,currency:'KRW',status:/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'IMAGE_RECOVERY_FAILED',officialUrl:active?.officialUrl??cfg.entryUrl});process.exitCode=1;}
 finally{await fs.writeFile(artifact+'/records.json',JSON.stringify(records),{mode:0o600});await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});await closeImageProcessor();await context.dispose();}
}
