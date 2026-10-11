import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const helper=fileURLToPath(new URL('./close-crawl-browser.mjs',import.meta.url));
const processes=()=>execFileSync('ps',['-axo','pid=,command='],{encoding:'utf8'}).split('\n').map(line=>line.trim().match(/^(\d+) (.*)$/)).filter(Boolean);
const entries=processes();let closed=0,skipped=0;
for(const [,pid,command] of entries){
 if(!command.startsWith('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome '))continue;
 const profile=command.match(/--user-data-dir=(\/Users\/ourmine\/dev\/luxury\/crawler\/runs\/[^\s]+\/browser-profile)(?:\s|$)/)?.[1];
 const port=command.match(/--remote-debugging-port=(\d+)(?:\s|$)/)?.[1];
 if(!profile||!port)continue;
 const owner=profile.match(/-(\d+)\/browser-profile$/)?.[1];
 if(owner&&entries.some(e=>e[1]===owner&&e[2].includes('run-crawler.sh'))){skipped++;continue;}
 try{execFileSync(process.execPath,[helper,port,profile],{stdio:'ignore',timeout:4000});}catch{}
 const live=processes().find(e=>e[1]===pid);
 if(live?.[2]===command){try{process.kill(Number(pid),'SIGTERM');}catch{}}
 closed++;
}
console.log(JSON.stringify({completedBrowsersCloseRequested:closed,activeBrowsersSkipped:skipped}));
