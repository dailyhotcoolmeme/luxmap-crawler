export function validateMaintenancePolicy(schedule) {
  const policy=schedule.maintenancePolicy,countries=['kr','jp','fr','it','es','us','sg','hk'];
  if(!policy||policy.includeNewRegisteredBrands!==true||JSON.stringify(policy.requiredCountries)!==JSON.stringify(countries)||policy.imageProcessingVersion!=='original-cutout-v1'||policy.priceHistory!=='append-on-change'||policy.missingProduct!=='official-404-410-twice-after-24h'||policy.restoreProduct!=='validated-official-200'||policy.onboardingSample!=='same-korean-sku-each-country')throw Error('common brand maintenance policy required');
  for(const brand of new Set(schedule.jobs.map(job=>job.brand))){
    if(countries.some(country=>!schedule.jobs.some(job=>job.brand===brand&&job.country===country)))throw Error('eight country jobs required for every registered brand');
  }
}
export function scheduleCalendar(schedule) {
  if(schedule.frequency!=='weekly'||schedule.weekday!==1||schedule.timeZone!=='Asia/Seoul')throw new Error('Monday Korean-time schedule required');
  const hours=schedule.primary==='github'?schedule.fallbackHours:[schedule.hour];
  if(!Array.isArray(hours)||!hours.length||hours.some(hour=>!Number.isInteger(hour)||hour<0||hour>23)||!Number.isInteger(schedule.minute)||schedule.minute<0||schedule.minute>59)throw new Error('invalid weekly timing');
  return hours.map(hour=>({Weekday:schedule.weekday,Hour:hour,Minute:schedule.minute}));
}
export function isScheduledDay(schedule, now=new Date()) {
  scheduleCalendar(schedule);
  return new Intl.DateTimeFormat('en-US',{timeZone:schedule.timeZone,weekday:'short'}).format(now)==='Mon';
}
export function schedulePlan(schedule, {smoke=false,respectAutomationHolds=false}={}) {
  if(schedule.version!==1||schedule.referenceCountry!=='KR'||schedule.discoverReferenceProducts!==true||!Array.isArray(schedule.jobs)||!schedule.jobs.length)throw new Error('Korean reference policy required');
  const brands=new Map(),seen=new Set();
  for(const job of schedule.jobs){
    const id=`${job.brand}/${job.country}`;
    if(!/^[a-z0-9-]+\/[a-z]{2}$/.test(id)||seen.has(id)||!/^scripts\/[a-z0-9-]+\.mjs$/.test(job.adapter))throw new Error('invalid or duplicate job');
    seen.add(id);
    if(!brands.has(job.brand))brands.set(job.brand,[]);
    brands.get(job.brand).push(job);
  }
  const held=schedule.automationHoldBrands??[];
  if(!Array.isArray(held)||new Set(held).size!==held.length||held.some(brand=>typeof brand!=='string'||!brands.has(brand)))throw Error('invalid automation hold brands');
  return [...brands.values()].flatMap(jobs=>{
    const korean=jobs.find(job=>job.country==='kr');
    if(!korean)throw new Error('Korean job required for every brand');
    const audit=schedule.referenceAudits?.[korean.brand];
    if(!/^scripts\/[a-z0-9-]+\.mjs$/.test(audit??''))throw new Error('registered reference audit required for every brand');
    if(respectAutomationHolds&&held.includes(korean.brand))return [];
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
    // Audit status 2 means every verified bag is stored, but source/category
    // uncertainty remains. Refresh only registered Korean references while the
    // overall run remains failed; never turn that uncertainty into completion.
    if(job.country==='kr'&&result.status!==0&&!(result.status===2&&(job.phase==='audit'||['louis-vuitton','dior'].includes(job.brand))))blockedBrands.add(job.brand);
  }
  return failed?1:0;
}
