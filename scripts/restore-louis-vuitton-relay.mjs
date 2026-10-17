import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {validLouisVuittonRelayHosts} from '../crawler/common/louis-vuitton-relay-scope.js';
const root=path.resolve(import.meta.dirname,'..'),file=root+'/crawler/runtime/louis-vuitton-browser/session.json',meta=JSON.parse(fs.readFileSync(file)),chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',hosts=['kr.louisvuitton.com','us.louisvuitton.com','api.louisvuitton.com'];
const country=process.argv[2];if(country){if(!['jp','fr','it','es','us','sg','hk'].includes(country)||process.argv.length!==3)throw Error('COUNTRY_SCOPE');const cfg=JSON.parse(fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/'+country)),proof=root+'/crawler/completeness/louis-vuitton/published-alternates/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status||!JSON.parse(fs.readFileSync(proof)).some(r=>r.country===cfg.country&&new URL(r.officialUrl).origin===new URL(cfg.entryUrl).origin))throw Error('PUBLISHED_HOST_PROOF_REQUIRED');const host=new URL(cfg.entryUrl).hostname;if(!hosts.includes(host))hosts.push(host);}
if(process.env.LUXURY_SERVICE_GUARD!=='enabled'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(meta.cdp))throw Error('OWNED_SESSION_REQUIRED');
const proof=root+'/crawler/completeness/louis-vuitton/published-alternates/summary.json';if(spawnSync(root+'/scripts/crawl-output-guard.sh',[proof],{stdio:'ignore'}).status||!JSON.parse(fs.readFileSync(proof)).some(r=>r.country==='US'&&new URL(r.officialUrl).hostname===hosts[1]))throw Error('PUBLISHED_HOST_PROOF_REQUIRED');
if(!validLouisVuittonRelayHosts(hosts,JSON.parse(fs.readFileSync(proof))))throw Error('RELAY_COUNTRY_SCOPE');
const port=new URL(meta.cdp).port,lines=execFileSync('/bin/ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n').map(s=>s.trim().match(/^(\d+)\s+(.*)$/)).filter(Boolean),owned=lines.filter(m=>m[2].startsWith(chrome+' ')&&m[2].includes('--remote-debugging-port='+port+' ')&&/--user-data-dir=\/Users\/ourmine\/dev\/luxury\/crawler\/runs\/louis-vuitton\/kr\/\d{8}T\d{6}Z-\d+\/browser-profile /.test(m[2]));
if(owned.length!==1)throw Error('BROWSER_OWNER_MISMATCH');const pid=Number(owned[0][1]),proxyPort=Number(owned[0][2].match(/--proxy-server=http:\/\/127\.0\.0\.1:(\d+)(?:\s|$)/)?.[1]);if(!Number.isInteger(proxyPort)||proxyPort<1024)throw Error('PROXY_SCOPE');
const version=await (await fetch(meta.cdp+'/json/version')).json();
const listening=spawnSync('/usr/sbin/lsof',['-ti','TCP:'+proxyPort,'-sTCP:LISTEN'],{encoding:'utf8'});
if(![0,1].includes(listening.status))throw Error('RELAY_INSPECTION_FAILED');
const old=listening.stdout.trim().split('\n').filter(Boolean);if(old.length>1)throw Error('RELAY_OWNER_MISMATCH');
if(old.length){const oldPid=Number(old[0]),command=lines.find(m=>Number(m[1])===oldPid)?.[2];if(!command?.includes(root+'/scripts/network-isolate.mjs ')||!command.includes(' '+port+' '+chrome))throw Error('RELAY_OWNER_MISMATCH');
 if(meta.allowedHosts?.length===hosts.length&&hosts.every(h=>meta.allowedHosts.includes(h)))process.exit(0);
 process.kill(oldPid,'SIGKILL');
}
const log=fs.openSync(root+'/crawler/runtime/louis-vuitton-browser/relay.log','a',0o600),child=spawn(process.execPath,[root+'/scripts/network-isolate.mjs',JSON.stringify(hosts),port,chrome],{detached:true,stdio:['ignore',log,log],env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR??'/tmp',LUXURY_RESTORE_BROWSER_PID:String(pid),LUXURY_RESTORE_PROXY_PORT:String(proxyPort),LUXURY_BROWSER_MAINTENANCE_SINK:'1',LUXURY_BROWSER_REJECT_UNLISTED:'1'}});child.unref();fs.closeSync(log);
let ready=false;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));const check=spawnSync('/usr/sbin/lsof',['-a','-p',String(child.pid),'-iTCP:'+proxyPort,'-sTCP:LISTEN','-t'],{encoding:'utf8'});if(check.status===0){ready=true;break;}}if(!ready)throw Error('RELAY_RESTORE_FAILED');
const after=await (await fetch(meta.cdp+'/json/version')).json();if(after.webSocketDebuggerUrl!==version.webSocketDebuggerUrl)throw Error('BROWSER_CHANGED');
fs.writeFileSync(file,JSON.stringify({...meta,allowedHosts:hosts,relayPid:child.pid,browserPid:pid,proxyPort}),{mode:0o600});
