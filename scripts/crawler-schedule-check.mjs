import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {schedulePlan,scheduleCalendar,validateMaintenancePolicy} from '../crawler/common/schedule-plan.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schedule=JSON.parse(fs.readFileSync(path.join(root,'crawler/schedule.json')));
schedulePlan(schedule);
scheduleCalendar(schedule);
validateMaintenancePolicy(schedule);
for(const adapter of Object.values(schedule.referenceAudits))if(!fs.existsSync(path.join(root,adapter)))throw new Error('reference audit adapter missing');
if(!Number.isInteger(schedule.hour)||schedule.hour<0||schedule.hour>23||!Number.isInteger(schedule.minute)||schedule.minute<0||schedule.minute>59)throw new Error('invalid schedule');
for(const job of schedule.jobs){
 if(!fs.existsSync(path.join(root,job.adapter)))throw new Error('adapter missing');
 const config=JSON.parse(fs.readFileSync(path.join(root,'crawler/brands',job.brand,'countries',job.country)));
 const listingUrls=config.listingUrls??(job.brand==='bottega-veneta'?config.probeListingUrls:null);
 const lvLocales={kr:'kor-kr',jp:'jpn-jp',fr:'fra-fr',it:'ita-it',es:'esp-es',us:'eng-us',sg:'eng-sg',hk:'eng-hk'};
 const louisVuitton=job.brand==='louis-vuitton'&&lvLocales[job.country]===config.locale&&config.localePrefix==='/'+config.locale+'/'&&new URL(config.entryUrl).origin==='https://'+job.country+'.louisvuitton.com'&&config.allowedHosts.length===2&&config.allowedHosts.includes(job.country+'.louisvuitton.com')&&config.allowedHosts.includes('api.louisvuitton.com')&&config.browserMode==='http'&&config.maxProductsPerRun===25&&config.maxRequestsPerRun===80&&config.maxDiscoveryPages===20;
 const priceOnly=job.brand==='bottega-veneta'&&job.country!=='kr'&&config.browserMode==='http'&&config.maxImagesPerProduct===0&&config.entryUrl===`https://www.bottegaveneta.com${config.localePrefix.replace(/\/$/,'')}`;
 const officialSitemap=job.brand==='van-cleef-arpels'&&job.country==='kr'&&config.category==='jewelry'&&config.browserMode==='http'&&config.entryUrl==='https://www.vancleefarpels.com/kr/ko/'&&config.localePrefix==='/kr/ko/'&&config.allowedHosts.length===1&&config.allowedHosts[0]==='www.vancleefarpels.com'&&config.maxDiscoveryPages===20&&config.maxProductsPerRun===25;
 const officialForeign=job.brand==='van-cleef-arpels'&&['jp','fr','it','es','us','sg','hk'].includes(job.country)&&config.category==='jewelry'&&config.browserMode==='http'&&config.maxImagesPerProduct===0&&config.allowedHosts.length===1&&config.allowedHosts[0]==='www.vancleefarpels.com'&&config.entryUrl===`https://www.vancleefarpels.com${config.localePrefix}`&&config.localePrefix.startsWith(`/${job.country}/`);
 const rolexLocales={jp:'ja-jp',fr:'fr-fr',it:'it-it',es:'es-es',us:'en-us',sg:'en-sg',hk:'en-hk'};
 const rolexReference=job.brand==='rolex'&&job.country==='kr'&&config.category==='watch'&&config.browserMode==='http'&&config.localePrefix==='/ko-kr/'&&config.sitemapLocalePrefix==='/api/sm/ko-kr/'&&config.maxDiscoveryPages===20&&config.maxProductsPerRun===25&&config.allowedHosts.includes('www.rolex.com')&&config.entryUrl==='https://www.rolex.com/ko-kr';
 const rolexForeign=job.brand==='rolex'&&rolexLocales[job.country]&&config.category==='watch'&&config.browserMode==='http'&&config.maxImagesPerProduct===0&&config.allowedHosts.length===1&&config.allowedHosts[0]==='www.rolex.com'&&config.localePrefix===`/${rolexLocales[job.country]}/`&&config.entryUrl===`https://www.rolex.com/${rolexLocales[job.country]}`;
 if(config.country!==job.country.toUpperCase()||!Array.isArray(config.allowedHosts)||!config.allowedHosts.length||(!louisVuitton&&!priceOnly&&!officialSitemap&&!officialForeign&&!rolexReference&&!rolexForeign&&(!Array.isArray(listingUrls)||!listingUrls.length)))throw new Error('invalid country configuration');
 if(job.brand==='chanel'&&(!/^\/[a-z]{2}(?:-[a-z]{2})?\/[a-z]+\/p\/$/.test(config.referenceDetailPrefix)||!new RegExp(config.detailPathPattern).test(`${config.referenceDetailPrefix}A01112/`)))throw new Error('invalid Korean reference mapping');
}
// Foreign coverage is an execution result, never a prerequisite for registering a country.
console.log('PASS: unified Korean-reference schedule validated.');
