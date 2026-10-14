import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),run=path.resolve(process.argv[2]??''),fallback=process.argv[3];
if(!run.startsWith(root+'/crawler/runs/')||!(/^[A-Z0-9_]{1,40}$/).test(fallback??''))throw Error('RUN_SCOPE');
const [brand,country]=path.relative(root+'/crawler/runs',run).split(path.sep);
const cfg=JSON.parse(fs.readFileSync(root+`/crawler/brands/${brand}/countries/${country}`,'utf8'));
let status=fallback,blockedHost=null;
const network=run+'/browser-network-status.json';
if(fs.existsSync(network)){const info=JSON.parse(fs.readFileSync(network));if(info.status==='blocked'){status='BROWSER_UNAUTHORIZED_NETWORK';if(/^[a-z0-9.-]{1,253}$/i.test(info.host??''))blockedHost=info.host;}}
const rows=[{brand,country:cfg.country,parentModel:'중앙 실행 안전 점검',variantCode:'RUN',price:null,currency:cfg.currency,status,officialUrl:cfg.entryUrl}];
if(blockedHost)rows.push({...rows[0],status:'DENIED_BACKGROUND_HOST',officialUrl:'https://'+blockedHost+'/'});
const out=run+'/runtime-report/summary.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(rows),{mode:0o600});
if(spawnSync(root+'/scripts/crawl-output-guard.sh',[out],{stdio:'ignore'}).status)throw Error('SUMMARY_GUARD');
