#!/usr/bin/env node
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {storeBottegaMarkets} from '../crawler/common/bottega-market-store.js';
if(process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled'||process.env.LUXURY_INGEST_BRAND!=='bottega-veneta')throw Error('guard required');
const country=process.env.LUXURY_MARKET_COUNTRY;if(!/^(jp|fr|it|es|us|sg|hk)$/.test(country))throw Error('invalid country');
const config=JSON.parse(fs.readFileSync(new URL(`../crawler/brands/bottega-veneta/countries/${country}`,import.meta.url))),key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('credential missing');
const query=async(endpoint,method='GET',body,prefer='return=representation')=>{const args=['-fsS','--max-time','30','--header','@-','-X',method,'-H','Content-Type: application/json','-H',`Prefer: ${prefer}`];if(body)args.push('--data',JSON.stringify(body));args.push('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/'+endpoint);return JSON.parse(execFileSync('/usr/bin/curl',args,{encoding:'utf8',input:`apikey: ${key}\nAuthorization: Bearer ${key}\n`,stdio:['pipe','pipe','pipe'],maxBuffer:1048576}));};
await storeBottegaMarkets(JSON.parse(fs.readFileSync(process.argv[2])),config,query);
