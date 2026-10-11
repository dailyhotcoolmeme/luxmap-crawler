import {execFileSync} from 'node:child_process';
const [port,profile]=process.argv.slice(2);
if(!/^\d+$/.test(port)||!profile?.includes('/crawler/runs/')||!profile.endsWith('/browser-profile'))process.exit(1);
const commands=execFileSync('ps',['-axo','command'],{encoding:'utf8'}).split('\n');
const owned=commands.some(line=>line.startsWith('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome ')&&line.includes(`--user-data-dir=${profile}`)&&line.includes(`--remote-debugging-port=${port}`));
if(!owned)process.exit(0);
const timer=setTimeout(()=>process.exit(1),2500);
try{
 const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)});
 const {webSocketDebuggerUrl:url}=await response.json();
 if(!url?.startsWith(`ws://127.0.0.1:${port}/`))throw new Error('invalid local endpoint');
 const socket=new WebSocket(url);
 socket.addEventListener('open',()=>socket.send(JSON.stringify({id:1,method:'Browser.close'})));
 await new Promise((resolve,reject)=>{socket.addEventListener('close',resolve);socket.addEventListener('error',reject);});
 clearTimeout(timer);
}catch{clearTimeout(timer);process.exitCode=1;}
