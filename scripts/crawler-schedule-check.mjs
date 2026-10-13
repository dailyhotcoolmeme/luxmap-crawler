import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {schedulePlan} from '../crawler/common/schedule-plan.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
schedulePlan(schedule);
for(const adapter of Object.values(schedule.referenceAudits))if(!fs.existsSync(path.join(root,adapter)))throw new Error('reference audit adapter missing');
if(!Number.isInteger(schedule.hour)||schedule.hour<0||schedule.hour>23||!Number.isInteger(schedule.minute)||schedule.minute<0||schedule.minute>59)throw new Error('invalid schedule');
for(const job of schedule.jobs){
 if(!fs.existsSync(path.join(root,job.adapter)))throw new Error('adapter missing');
 const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',job.brand,'countries',job.country)));
 const listingUrls=config.listingUrls??(job.brand==='bottega-veneta'?config.probeListingUrls:null);
 const priceOnly=job.brand==='bottega-veneta'&&job.country!=='kr'&&config.browserMode==='http'&&config.maxImagesPerProduct===0&&config.entryUrl===`https://www.bottegaveneta.com${config.localePrefix.replace(/\/$/,'')}`;
 if(config.country!==job.country.toUpperCase()||!Array.isArray(config.allowedHosts)||!config.allowedHosts.length||(!priceOnly&&(!Array.isArray(listingUrls)||!listingUrls.length)))throw new Error('invalid country configuration');
 if(job.brand==='chanel'&&(!/^\/[a-z]{2}(?:-[a-z]{2})?\/[a-z]+\/p\/$/.test(config.referenceDetailPrefix)||!new RegExp(config.detailPathPattern).test(`${config.referenceDetailPrefix}A01112/`)))throw new Error('invalid Korean reference mapping');
}
// Foreign coverage is an execution result, never a prerequisite for registering a country.
console.log('PASS: unified Korean-reference schedule validated.');
