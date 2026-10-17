import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createLouisVuittonRepairClient} from '../crawler/common/louis-vuitton-repair-rest.js';
const source=path.resolve(import.meta.dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'lv-repair-'));
const put=(f,v)=>{fs.mkdirSync(path.dirname(root+'/'+f),{recursive:true});fs.writeFileSync(root+'/'+f,typeof v==='string'?v:JSON.stringify(v),{mode:0o700});};
try{
 const url='https://kr.louisvuitton.com/kor-kr/products/bag-nvprod123v/M12345',record={code:'M12345',name:'Fixture Bag',url};
 for(const dir of ['catalog-source','expanded-catalog-source']){put('crawler/completeness/louis-vuitton/'+dir+'/candidates.json',[record]);put('crawler/completeness/louis-vuitton/'+dir+'/summary.json',[]);}
 fs.mkdirSync(root+'/crawler/runs/louis-vuitton/kr',{recursive:true});
 put('crawler/completeness/louis-vuitton/field-source/summary.json',[]);
 put('crawler/completeness/louis-vuitton/field-source/fields.json',[{code:'M12345',color:'Red',material:'Leather',widthMm:200,heightMm:150,depthMm:80,sourceCountry:'KR'}]);
 put('scripts/crawl-output-guard.sh','#!/bin/sh\nexit 0\n');
 let code=fs.readFileSync(source+'/scripts/repair-louis-vuitton-metadata.mjs','utf8');
 code=code.replace("'../crawler/common/louis-vuitton-repair-rest.js'","'./client-fixture.mjs'").replace("'../crawler/common/louis-vuitton-registered.js'","'./registered-fixture.mjs'");
 for(const f of ['louis-vuitton-metadata.js','louis-vuitton-product.js'])code=code.replace("'../crawler/common/"+f+"'",JSON.stringify('file://'+source+'/crawler/common/'+f));
 put('scripts/repair-louis-vuitton-metadata.mjs',code);put('scripts/registered-fixture.mjs','export const readRegisteredLouisVuitton=()=>[];');
 put('crawler/common/louis-vuitton-metadata.js','fixture selection version');
 put('scripts/client-fixture.mjs',`import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..'),variant={},market={country_code:'KR'};export const request={async newContext(){return {async get(url,options){if(options.headers.apikey){if(options.headers.apikey!=='fixture-public'||options.headers.Authorization!=='Bearer fixture-public')throw Error('Invalid header');fs.appendFileSync(root+'/public-checks.txt','public\\n');}const body=url.includes('/brands?')?[{id:'brand'}]:url.includes('select=id,model_id')?[{id:'variant',model_id:'model',market_products:[{id:'market',country_code:'KR',official_url:${JSON.stringify(url)},official_product_code:'M12345',currency_code:'KRW'}]}]:[{...variant,product_models:{name_ko:'Fixture Bag'},market_products:[market]}];return {ok:()=>true,json:async()=>body};},async patch(url,{data}){Object.assign(url.includes('/product_variants?')?variant:market,data);return {ok:()=>true};},async dispose(){}};}};`);
 const r=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)(deny network*)',process.execPath,root+'/scripts/repair-louis-vuitton-metadata.mjs'],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,LUXURY_SERVICE_GUARD:'enabled',LUXURY_COORDINATOR_OWNER:'fixture',SUPABASE_SERVICE_ROLE_KEY:'fixture-service',EXPO_PUBLIC_SUPABASE_KEY:'fixture-public\n'},timeout:30000});
 assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(root+'/public-checks.txt','utf8'),'public\n');
 const proof=JSON.parse(fs.readFileSync(root+'/crawler/completeness/louis-vuitton/metadata-repair/summary.json'));assert(proof.some(r=>r.status==='CLEAN_PRODUCT_NAME_PUBLIC_VERIFIED'));
 const previous={guard:process.env.LUXURY_SERVICE_GUARD,owner:process.env.LUXURY_COORDINATOR_OWNER};process.env.LUXURY_SERVICE_GUARD='enabled';process.env.LUXURY_COORDINATOR_OWNER='fixture';
 try{let calls=0;const client=createLouisVuittonRepairClient({extraHTTPHeaders:{apikey:'fixture-service'}},(route,method,body,key)=>{calls++;assert.equal(route,'brands');assert.equal(method,'GET');assert.equal(key,'fixture-public');return [];});assert.deepEqual(await (await client.get('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/brands',{headers:{apikey:'fixture-public'}})).json(),[]);await assert.rejects(()=>client.get('https://example.com/rest/v1/brands'),/REPAIR_DESTINATION/);assert.equal(calls,1);}finally{for(const [key,value] of [['LUXURY_SERVICE_GUARD',previous.guard],['LUXURY_COORDINATOR_OWNER',previous.owner]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
 console.log('PASS: actual LV metadata repair verifies all attributes; established guarded REST retains lease and anonymous key scope; network denied');
}finally{fs.rmSync(root,{recursive:true,force:true});}
