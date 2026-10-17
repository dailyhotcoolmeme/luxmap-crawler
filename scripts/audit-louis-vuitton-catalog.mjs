import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
const root=path.resolve(import.meta.dirname,'..'),out=root+'/crawler/completeness/louis-vuitton/weekly-audit';
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!process.env.LUXURY_COORDINATOR_OWNER||process.argv[2]!=='kr')throw Error('AUDIT_SCOPE');
const refs=guardedRest('rpc/crawler_korean_references','POST',{p_brand:'louis-vuitton'}),rows=['REGISTERED_KR_REFERENCES_'+refs.length,'DISCOVERY_AUDIT_REQUIRED','CATALOG_NOT_COMPLETE'].map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'주간 독립 전체발견 감사 상태',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'}));
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/summary.json',JSON.stringify(rows),{mode:0o600});if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('AUDIT_OUTPUT_GUARD');process.exitCode=2;
