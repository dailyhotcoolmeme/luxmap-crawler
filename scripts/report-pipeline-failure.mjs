import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),run=path.resolve(process.argv[2]??''),stage=process.argv[3],log=process.argv[4];
if(!run.startsWith(root+'/crawler/runs/')||!['AVAILABILITY','PRICE_STORAGE'].includes(stage)||path.dirname(log)!==run)throw Error('PIPELINE_REPORT_SCOPE');
const [brand,country]=path.relative(root+'/crawler/runs',run).split('/'),cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/'+brand+'/countries/'+country));
let status=stage+'_FAILED';
try{const st=fs.lstatSync(log);if(st.isFile()&&!st.isSymbolicLink()&&st.size<=1048576){const text=fs.readFileSync(log,'utf8');const code=text.match(/(?:Error: |(?:FAILED|BLOCKED): )([A-Z][A-Z0-9_]{1,39})\b/)?.[1]??text.match(/^([A-Z][A-Z0-9_]{1,39})\s*$/m)?.[1];if(code)status=code;}}finally{fs.chmodSync(log,0o000);}
const f=run+'/pipeline-report/summary.json';fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify([{brand,country:cfg.country,parentModel:'중앙 저장 중단 단계 '+stage,variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl??cfg.listingUrls[0]}]),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');
