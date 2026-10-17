// Offline preparation of saved, normally accessible official documents. No
// requests, credentials, image processing or storage writes are made here.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sourceFingerprint,materializedFingerprint} from './louis-vuitton-source-cache.mjs';
const root=path.resolve(import.meta.dirname,'..');
if(process.argv.length!==2)throw Error('PREPARATION_SCOPE');
const run=(script,args=[])=>{if(spawnSync(process.execPath,[root+'/scripts/'+script,...args],{stdio:'ignore'}).status)throw Error('SOURCE_PREPARATION_FAILED');};
const guard=file=>{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');return JSON.parse(fs.readFileSync(file));};
for(const country of ['kr','us']){
 const base=root+'/crawler/runs/louis-vuitton/'+country;if(!fs.existsSync(base))continue;
 for(const id of fs.readdirSync(base).sort()){
  const dir=base+'/'+id,file=dir+'/summary.json';if(!fs.existsSync(file))continue;
  const rows=guard(file),initial=country==='kr'&&rows.some(r=>/^CATEGORY_LINKS_\d+$|^LISTING_LINKS_\d+$/.test(r.status));
  const nativePrice=country==='kr'&&rows.some(r=>r.parentModel==='한국 동일 SKU 해외 SKU 연결'&&r.status==='API_HTTP_200');
  const refused=rows.some(r=>/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status));
  // Like the established partial-batch pipeline, retain verified documents
  // saved before a later request failed. Recovery independently checks their
  // content and limits a partial browser run to its confirmed file prefix.
  if(!(initial||nativePrice||rows.some(r=>r.parentModel==='LV 공식 SKU 상품 모델 연결'&&r.status==='CATALOG_HTTP_200')||rows.some(r=>['NORMAL_HTTP_DOCUMENT_SAVED','CATALOG_MODEL_PROJECTION_SAVED','NORMAL_RENDERED_DOCUMENT_SAVED','NORMAL_COUNTRY_DOCUMENT_SAVED','OFFICIAL_ATTRIBUTE_SOURCE_SAVED','EXACT_SKU_URL'].includes(r.status)))||rows.some(r=>/UNAUTHORIZED|POLICY|LIMIT|GUARD|SANDBOX/.test(r.status))||refused&&!nativePrice&&!rows.some(r=>r.status==='NORMAL_RENDERED_DOCUMENT_SAVED')&&!rows.some(r=>r.status==='CATALOG_MODEL_PROJECTION_SAVED'))continue;
  const input=sourceFingerprint(dir),cache=dir+'/artifacts/native-metadata/inputs.json';let old;
  try{old=JSON.parse(fs.readFileSync(cache));}catch(e){if(e.code!=='ENOENT')throw e;}
  let fresh=false;if(old?.input===input){guard(dir+'/artifacts/native-metadata/summary.json');fresh=old.output===materializedFingerprint(dir);}
  if(!fresh){run('recover-louis-vuitton-metadata.mjs',[dir]);guard(dir+'/artifacts/native-metadata/summary.json');const temp=cache+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify({input,output:materializedFingerprint(dir)}),{mode:0o600});fs.renameSync(temp,cache);}
 }
}
run('extract-louis-vuitton-fields.mjs');
run('prepare-louis-vuitton-catalog.mjs',['--expand-image-category']);
run('prepare-louis-vuitton-ready.mjs');
guard(root+'/crawler/completeness/louis-vuitton/ready-catalog-source/summary.json');
