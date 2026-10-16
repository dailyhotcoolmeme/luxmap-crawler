import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'luxmap-reference-gate-'));
const scripts=path.join(temp,'scripts');fs.mkdirSync(scripts);
const put=(name,body)=>{fs.writeFileSync(path.join(scripts,name),body,{mode:0o700});};
try{
 fs.copyFileSync(root+'/scripts/run-brand-country-pipeline.sh',scripts+'/run-brand-country-pipeline.sh');
 put('crawler-env.sh','#!/bin/sh\n');
 put('token-safety-gate.sh','#!/bin/sh\nexit 0\n');
 put('crawl-output-guard.sh','#!/bin/sh\nexit 0\n');
 put('run-crawler.sh','#!/bin/sh\nexec node "$(dirname "$0")/mock-run.mjs" "$@"\n');
 put('mock-run.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..'),[brand,country]=process.argv.slice(2),run=root+'/crawler/runs/'+brand+'/'+country+'/20261015T000000Z-'+process.pid;fs.mkdirSync(run+'/artifacts',{recursive:true});fs.mkdirSync(run+'/raw',{recursive:true});fs.mkdirSync(run+'/browser-profile',{recursive:true});fs.writeFileSync(run+'/artifacts/records.json','[]');fs.writeFileSync(run+'/summary.json','[]');`);
 put('network-isolate.mjs',`import fs from 'node:fs';import path from 'node:path';fs.writeFileSync(path.resolve(import.meta.dirname,'../storage.reached'),'yes');`);
 put('ingest-catalog-availability.mjs','process.exit(0);');
 put('check-louis-vuitton-completion.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..');fs.writeFileSync(root+'/audit.reached','louis-vuitton');process.exitCode=JSON.parse(fs.readFileSync(root+'/audit-exit.json'));`);
 put('cleanup-image-originals.mjs',`import fs from 'node:fs';import path from 'node:path';fs.writeFileSync(path.resolve(import.meta.dirname,'../originals.cleaned'),'yes');`);
 put('audit-official-reference.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..');fs.writeFileSync(root+'/audit.reached',process.argv[3]);process.exitCode=JSON.parse(fs.readFileSync(root+'/audit-exit.json'));`);
 for(const [brand,code] of [['hermes',1],['dior',2],['saint-laurent',1],['bulgari',0],['bulgari',1],['louis-vuitton',2],['louis-vuitton',0],['chanel',1]]){
  for(const file of ['storage.reached','originals.cleaned','audit.reached'])try{fs.unlinkSync(temp+'/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
  fs.writeFileSync(temp+'/audit-exit.json',JSON.stringify(code));
  // All network is kernel-denied; storage is a stub. These are shell-flow tests,
  // not evidence of image processing, database writes or a completed catalog.
  const run=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)','/bin/sh',scripts+'/run-brand-country-pipeline.sh',brand,'kr','--batch-offset','0'],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR??'/tmp',SUPABASE_SERVICE_ROLE_KEY:'fixture-not-a-real-key',SUPABASE_ANON_KEY:'fixture-not-a-real-key',CLOUDFLARE_API_TOKEN:'fixture-not-a-real-key'}});
  assert(fs.existsSync(temp+'/storage.reached'),`mock pipeline ${brand} exit ${run.status}: ${run.stderr.slice(-1800)} ${run.stdout.slice(-500)}`);assert(fs.existsSync(temp+'/originals.cleaned'));
  if(brand==='chanel'){assert.equal(run.status,0);assert(!fs.existsSync(temp+'/audit.reached'));}
  else{
   assert(fs.existsSync(temp+'/audit.reached'),`mock audit ${brand} exit ${run.status}: ${run.stderr.slice(-1800)} ${run.stdout.slice(-500)}`);
   assert.equal(fs.readFileSync(temp+'/audit.reached','utf8'),brand);assert.equal(run.status,code);
   if(code)assert(!run.stdout.includes('crawl and storage completed'));
   else assert(run.stdout.includes('crawl and storage completed'));
  }
 }
 console.log('PASS: isolated shell gate blocks whole-success on audit 1/2 after stored rows, preserves success 0 and existing-brand flow; no real storage/network');
}finally{assert(temp.startsWith(path.join(fs.realpathSync(os.tmpdir()),'luxmap-reference-gate-')));fs.rmSync(temp,{recursive:true,force:true});}
