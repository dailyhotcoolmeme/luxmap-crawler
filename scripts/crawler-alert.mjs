import {createHash} from 'node:crypto';
export async function reportCrawlFailure(summary){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)return;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 const dedupe_key='crawl_failure:'+createHash('sha256').update(`${day}:${summary.brand}:${summary.country}:${summary.status}:${summary.variantCode}`).digest('hex');
 const response=await fetch('https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/operations_alerts?on_conflict=dedupe_key',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({dedupe_key,kind:'crawl_failure',summary}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('administrator alert storage failed');
}
