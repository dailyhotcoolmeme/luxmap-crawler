import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {storePradaMarkets} from '../crawler/common/prada-market-store.js';
if(process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_INGEST_BRAND!=='prada')throw new Error('guard required');
const country=process.env.LUXURY_MARKET_COUNTRY;if(!/^(kr|jp|fr|it|es|us|sg|hk)$/.test(country))throw new Error('invalid country');
const config=JSON.parse(fs.readFileSync(new URL(`../crawler/brands/prada/countries/${country}`,import.meta.url)));
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw new Error('missing credential');
const query=async(endpoint,method='GET',body,prefer='return=representation')=>{
 const args=['-fsS','--max-time','30','--header','@-','-X',method,'-H','Content-Type: application/json','-H',`Prefer: ${prefer}`];if(body)args.push('--data',JSON.stringify(body));args.push('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+endpoint);
 return JSON.parse(execFileSync('/usr/bin/curl',args,{encoding:'utf8',input:`apikey: ${key}\nAuthorization: Bearer ${key}\n`,stdio:['pipe','pipe','pipe'],maxBuffer:1048576}));
};
await storePradaMarkets(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),config,query);
console.log('PASS: Prada foreign batch stored and verified.');
