import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {reportCrawlFailure} from './crawler-alert.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'luxmap-alert-test-'));
const queuePath=path.join(dir,'queue.json');
const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';
const summary={brand:'chanel',country:'US',status:'DETAIL_TIMEOUT',variantCode:'TEST'};
try{
 assert.equal((await reportCrawlFailure(summary,{queuePath,fetcher:async()=>{throw new Error('offline');}})).stored,false);
 assert.equal(JSON.parse(fs.readFileSync(queuePath)).length,1);
 assert.equal((await reportCrawlFailure(summary,{queuePath,fetcher:async()=>({ok:false,status:503})})).status,'ALERT_HTTP_503');
 assert.equal(JSON.parse(fs.readFileSync(queuePath)).length,1);
 assert.equal((await reportCrawlFailure(summary,{queuePath,fetcher:async(_,options)=>{assert.equal(JSON.parse(options.body).length,1);return {ok:true};}})).stored,true);
 assert.equal(JSON.parse(fs.readFileSync(queuePath)).length,0);
 console.log('PASS: alert delivery failures are queued, deduplicated and recovered without aborting collection.');
}finally{
 if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous;
 fs.rmSync(dir,{recursive:true});
}
