import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {catalogCompletion} from '../crawler/common/catalog-completion.js';
import {heldCatalogItem} from '../crawler/common/catalog-workflow.js';
const root=path.resolve(import.meta.dirname,'..'),base=root+'/crawler/completeness/louis-vuitton';
const read=folder=>{const file=base+'/'+folder+'/summary.json';if(!fs.existsSync(file))return [];if(spawnSync(root+'/scripts/crawl-output-guard.sh',[file],{stdio:'ignore'}).status)throw Error('COMPLETION_SOURCE_GUARD');return JSON.parse(fs.readFileSync(file));};
const publicRows=read('public-reference'),catalog=read('expanded-catalog-source'),ready=read('ready-catalog-source');
const value=(rows,prefix)=>{const r=rows.find(r=>r.status.startsWith(prefix));return r&&/^\d+$/.test(r.status.slice(prefix.length))?Number(r.status.slice(prefix.length)):null;};
let held={};try{const state=JSON.parse(fs.readFileSync(root+'/crawler/runtime/louis-vuitton-browser/workflow.json'));if(state.version!==1)throw Error('WORKFLOW_STATE_GUARD');held=state.ingestHeld??{};}catch(e){if(e.code!=='ENOENT')throw e;}
const readyFile=base+'/ready-catalog-source/candidates.json',readyList=fs.existsSync(readyFile)?JSON.parse(fs.readFileSync(readyFile)):[],readyCount=value(ready,'NEW_EXACT_BAGS_');if(readyCount!==null&&readyList.length!==readyCount)throw Error('READY_SCOPE_GUARD');
const heldCount=readyList.filter(s=>heldCatalogItem(s,held)).length,result=catalogCompletion(publicRows,value(catalog,'BAG_NAME_IMAGE_MATCHES_'),readyCount,heldCount);
const statuses=[result.complete?'CATALOG_COMPLETE':'PARTIAL_SUCCESS_EXIT_BLOCKED',result.next,'HELD_IMAGE_ITEMS_'+heldCount];if(result.remaining!==null)statuses.push('FULL_SCOPE_REMAINING_'+result.remaining);
const out=base+'/completion-gate';fs.mkdirSync(out,{recursive:true});fs.writeFileSync(out+'/summary.json',JSON.stringify(statuses.map(status=>({brand:'louis-vuitton',country:'KR',parentModel:'전체 수집 완료 관문',variantCode:'TOTAL',price:null,currency:'KRW',status,officialUrl:'https://kr.louisvuitton.com/kor-kr/homepage'}))),{mode:0o600});
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out+'/summary.json'],{stdio:'ignore'}).status)throw Error('COMPLETION_OUTPUT_GUARD');
process.exitCode=result.complete?0:2;
