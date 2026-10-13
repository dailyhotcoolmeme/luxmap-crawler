import fs from 'node:fs';
import path from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {referenceState,referenceStateKey,validateReferenceMarkets} from '../crawler/common/bottega-reference-state.js';
const root=path.resolve(import.meta.dirname,'..'),mode=process.argv[2],folder=path.join(root,'crawler/completeness/bottega-veneta/reconciled-metadata');
async function main(){
if(!['pull','push'].includes(mode)||process.argv.length!==3||spawnSync(path.join(root,'scripts/crawl-preflight.sh'),[],{stdio:'ignore'}).status)throw Error('blocked');
let token=process.env.CLOUDFLARE_API_TOKEN;if(!token&&process.platform==='darwin')token=execFileSync('/usr/bin/security',['find-generic-password','-s','luxury.cloudflare.api-token','-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();if(!token)throw Error('STATE_CREDENTIAL_UNAVAILABLE');
const endpoint=`https://api.cloudflare.com/client/v4/accounts/4c0f5d706177b84ade4d424a08ec46e8/r2/buckets/luxury-media/objects/${referenceStateKey}`;
async function request(method,body){
 fs.mkdirSync(folder,{recursive:true});const temp=fs.mkdtempSync(path.join(folder,'state-transfer-')),file=path.join(temp,'body.json');
 try{
  const args=[path.join(root,'scripts/network-isolate.mjs'),JSON.stringify(['api.cloudflare.com']),'0','/usr/bin/curl','--fail','--silent','--show-error','--max-time','20','--request',method,'--header','@-'];
  if(body!==undefined){fs.writeFileSync(file,body,{mode:0o600});args.push('--data-binary',`@${file}`);}args.push(endpoint);
  const output=execFileSync(process.execPath,args,{input:`Authorization: Bearer ${token}\nContent-Type: application/json\n`,encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR},stdio:['pipe','pipe','pipe'],maxBuffer:4194304,timeout:25000});
  if(method==='GET')return JSON.parse(output);
 }catch(error){throw Object.assign(Error('REFERENCE_STORAGE_FAILED'),{failureCode:'REFERENCE_STORAGE_FAILED',exitCode:error.status===78||error.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?78:1});}
 finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(temp);}
}
const variants=[];for(let offset=0;;offset+=100){const rows=await guardedRest(`product_variants?brands.slug=eq.bottega-veneta&active=eq.true&select=normalized_code,brands!inner(slug),market_products(country_code,official_product_code,currency_code,current_price,official_url)&order=id&limit=100&offset=${offset}`);variants.push(...rows);if(rows.length<100)break;}
let state;
if(mode==='push'){
 if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[path.join(folder,'summary.json')],{stdio:'ignore'}).status)throw Error('REFERENCE_SUMMARY_UNVERIFIED');state=referenceState(JSON.parse(fs.readFileSync(path.join(folder,'validated-products.json'))));validateReferenceMarkets(state,variants);
 const body=JSON.stringify(state);if(Buffer.byteLength(body)>4194304)throw Error('REFERENCE_LIMIT');await request('PUT',body);const actual=await request('GET');if(createHash('sha256').update(JSON.stringify(actual)).digest('hex')!==createHash('sha256').update(body).digest('hex'))throw Error('REFERENCE_STORAGE_UNVERIFIED');
}else{state=await request('GET');const rows=validateReferenceMarkets(state,variants);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'validated-products.json'),JSON.stringify(rows),{mode:0o600});}
const file=path.join(folder,mode==='push'?'checkpoint/summary.json':'summary.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify([{brand:'bottega-veneta',country:'KR',parentModel:'이전 한국 기준 상품 서버 보관·DB 대조',variantCode:'TOTAL',price:null,currency:'KRW',status:`REFERENCE_${mode.toUpperCase()}_VERIFIED_${state.records.length}`,officialUrl:'https://www.bottegaveneta.com/ko-kr'}]));if(spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[file],{stdio:'ignore'}).status)throw Error('blocked');
}
await main().catch(error=>{process.exitCode=error.exitCode??1;});
