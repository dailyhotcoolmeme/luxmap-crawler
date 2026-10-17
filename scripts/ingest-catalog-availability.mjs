import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {guardedRest} from '../crawler/common/guarded-rest.js';
import {availabilityEvidence} from '../crawler/common/catalog-availability.js';
const root=path.resolve(import.meta.dirname,'..'),run=path.resolve(process.argv[2]??'');
if(process.env.LUXURY_PIPELINE_GUARD!=='enabled'||!run.startsWith(path.join(root,'crawler/runs')+path.sep))throw Error('CENTRAL_RUN_REQUIRED');
const [brand,country,sourceRun]=path.relative(path.join(root,'crawler/runs'),run).split(path.sep);
if(country!=='kr'||!['chanel','prada','bottega-veneta','van-cleef-arpels','rolex','louis-vuitton'].includes(brand))process.exit(0);
const file=path.join(run,'artifacts/availability.json');if(!fs.existsSync(file))process.exit(0);
if(fs.statSync(file).size>262144)throw Error('AVAILABILITY_LIMIT');
const cfg=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',brand,'countries/kr'))),rows=JSON.parse(fs.readFileSync(file));
if(!Array.isArray(rows)||rows.length>500)throw Error('AVAILABILITY_LIMIT');
const guard=f=>fs.existsSync(f)&&spawnSync(path.join(root,'scripts/crawl-output-guard.sh'),[f],{stdio:'ignore'}).status===0;
const summaries=['summary.json','runtime-report/summary.json'].map(name=>path.join(run,name)).filter(guard);
if(!summaries.length)throw Error('AVAILABILITY_SOURCE_UNVERIFIED');
if(summaries.some(f=>JSON.parse(fs.readFileSync(f)).some(r=>/UNAUTHORIZED|SANDBOX|TOKEN|ACCESS_BLOCKED|REQUEST_LIMIT|RESPONSE_LIMIT|NETWORK_POLICY/.test(r.status))))process.exit(78);
const report=[];
for(const row of rows){
 if(!availabilityEvidence(cfg,row.url,row.httpStatus,row.httpStatus===200,new Date(row.checkedAt)))throw Error('AVAILABILITY_EVIDENCE_INVALID');
 const status=guardedRest('rpc/record_catalog_availability','POST',{p_brand:brand,p_url:row.url,p_http_status:row.httpStatus,p_observed_at:row.checkedAt,p_source_run:sourceRun});
 if(!['REFERENCE_NOT_UNIQUE','EVIDENCE_ALREADY_SEEN','AVAILABLE','MISSING_PENDING','MISSING_CONFIRMED'].includes(status))throw Error('AVAILABILITY_RESPONSE_INVALID');
 report.push({brand,country:'KR',parentModel:'공식 한국 상품 공개 상태',variantCode:'AVAILABILITY',price:null,currency:'KRW',status,officialUrl:row.url});
}
const out=path.join(run,'availability-report/summary.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report),{mode:0o600});if(!guard(out))throw Error('AVAILABILITY_SUMMARY_BLOCKED');
