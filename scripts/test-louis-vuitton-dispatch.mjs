import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'lv-dispatch-'));
try{
 fs.mkdirSync(root+'/scripts');
 for(const name of ['official-brand-reference.mjs','official-brand-probe.mjs'])fs.copyFileSync(source+'/scripts/'+name,root+'/scripts/'+name);
 const call=root+'/call.json';
 fs.writeFileSync(root+'/scripts/run-brand-country-pipeline.sh','#!/bin/sh\nexec '+JSON.stringify(process.execPath)+' '+JSON.stringify(root+'/scripts/fixture.mjs')+' "$@"\n',{mode:0o700});
 fs.writeFileSync(root+'/scripts/fixture.mjs','import fs from "node:fs";fs.writeFileSync('+JSON.stringify(call)+',JSON.stringify(process.argv.slice(2)));process.exitCode=2;');
 const invoke=(script,args)=>spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)',process.execPath,root+'/scripts/'+script,...args],{env:{...process.env,LUXURY_SERVICE_GUARD:'enabled'},stdio:'ignore'});
 assert.equal(invoke('official-brand-reference.mjs',['louis-vuitton','--batch-offset','0']).status,2);
 assert.deepEqual(JSON.parse(fs.readFileSync(call)),['louis-vuitton','kr','--batch-offset','0']);
 fs.unlinkSync(call);
 assert.equal(invoke('official-brand-probe.mjs',['louis-vuitton','--probe-sitemap-source']).status,2);
 assert.deepEqual(JSON.parse(fs.readFileSync(call)),['louis-vuitton','kr','--crawl-only','--probe-sitemap-source']);fs.unlinkSync(call);
 for(const [script,args] of [['official-brand-reference.mjs',['louis-vuitton','--batch-offset','-1']],['official-brand-reference.mjs',['louis-vuitton','--recover-source-run','/fixture']],['official-brand-probe.mjs',['louis-vuitton','--probe-sitemap-source','extra']],['official-brand-probe.mjs',['louis-vuitton','--probe-product-api']]]){assert.notEqual(invoke(script,args).status,0);assert(!fs.existsSync(call));}
 console.log('PASS: LV exact central batch/sitemap dispatch, partial exit preservation and scope rejection; no network/storage');
}finally{fs.rmSync(root,{recursive:true,force:true});}
// The existing weekly workflow invokes this reviewed LV regression entrypoint.
// Keep new adapter regressions connected without changing workflow permissions.
for(const file of ['test-louis-vuitton-foreign.mjs','test-louis-vuitton-foreign-model.mjs','test-louis-vuitton-relay-scope.mjs','test-louis-vuitton-market-store.mjs','test-louis-vuitton-weekly.mjs'])await import('./'+file);
