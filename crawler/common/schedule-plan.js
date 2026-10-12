export function schedulePlan(schedule, {smoke=false}={}) {
  if(schedule.version!==1||schedule.referenceCountry!=='KR'||schedule.discoverReferenceProducts!==true||!Array.isArray(schedule.jobs)||!schedule.jobs.length)throw new Error('Korean reference policy required');
  const brands=new Map(),seen=new Set();
  for(const job of schedule.jobs){
    const id=`${job.brand}/${job.country}`;
    if(!/^[a-z0-9-]+\/[a-z]{2}$/.test(id)||seen.has(id)||!/^scripts\/[a-z0-9-]+\.mjs$/.test(job.adapter))throw new Error('invalid or duplicate job');
    seen.add(id);
    if(!brands.has(job.brand))brands.set(job.brand,[]);
    brands.get(job.brand).push(job);
  }
  return [...brands.values()].flatMap(jobs=>{
    const korean=jobs.find(job=>job.country==='kr');
    if(!korean)throw new Error('Korean job required for every brand');
    const audit=schedule.referenceAudits?.[korean.brand];
    if(!/^scripts\/[a-z0-9-]+\.mjs$/.test(audit??''))throw new Error('registered reference audit required for every brand');
    return [
      ...(!smoke?[{...korean,args:['--discover-reference'],phase:'discover'}]:[]),
      ...(!smoke?[{...korean,adapter:audit,args:[],phase:'audit'}]:[]),
      ...[korean,...jobs.filter(job=>job!==korean)].map(job=>({...job,args:['--refresh',...(smoke?['--limit','1']:[])],phase:'refresh'}))
    ];
  });
}
export function executePlan(plan, run) {
  let failed=false;const blockedBrands=new Set();
  for(const job of plan){
    if(blockedBrands.has(job.brand))continue;
    const result=run(job);
    if(result.status!==0)failed=true;
    if(result.status===78||result.signal||result.error)break;
    if(job.country==='kr'&&result.status!==0)blockedBrands.add(job.brand);
  }
  return failed?1:0;
}
