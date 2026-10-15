import fs from 'node:fs';
import path from 'node:path';
const brands=new Set(['chanel','prada','bottega-veneta','van-cleef-arpels','rolex']);
export function availabilityEvidence(config,url,status,validated=false,now=new Date()){
 const home=config.entryUrl??config.listingUrls?.[0];
 const brand=config.brand??({'www.chanel.com':'chanel','www.prada.com':'prada'}[home?new URL(home).hostname:'']);
 if(config.country!=='KR'||!brands.has(brand))return null;
 if(![200,404,410].includes(status)||(status===200&&!validated))return null;
 const u=new URL(url),pattern=config.productPathPattern??config.detailPathPattern??(brand==='prada'?'^/kr/ko/p/(?:[^/]+/)*[A-Z0-9_]+/?$':null);
 if(!pattern||u.protocol!=='https:'||u.username||u.password||!config.allowedHosts.includes(u.hostname)||!new RegExp(pattern,'i').test(u.pathname))return null;
 return {brand,url:u.href,httpStatus:status,checkedAt:now.toISOString()};
}
export function recordAvailability(run,config,url,status,validated=false){
 const evidence=availabilityEvidence(config,url,status,validated);if(!evidence)return;
 const root=path.resolve(import.meta.dirname,'../..'),base=path.join(root,'crawler/runs',evidence.brand,'kr');
 if(!path.resolve(run).startsWith(base+path.sep))throw Error('AVAILABILITY_RUN_SCOPE');
 const file=path.join(run,'artifacts/availability.json');fs.mkdirSync(path.dirname(file),{recursive:true});
 const rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
 const next=[...rows.filter(row=>row.url!==evidence.url),evidence],body=JSON.stringify(next);
 if(next.length>500||Buffer.byteLength(body)>262144)throw Error('AVAILABILITY_LIMIT');
 fs.writeFileSync(file,body,{mode:0o600});
}
