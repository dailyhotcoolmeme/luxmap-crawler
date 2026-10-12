import {reportCrawlFailure} from '../../scripts/crawler-alert.mjs';
import {guardedRest} from './guarded-rest.js';
export async function reportAuditFailure(summary,{queuePath,safetyBlocked=false}={}){
 return reportCrawlFailure(summary,{queuePath,fetcher:async(url,options)=>{
  if(safetyBlocked)throw Error('safety policy blocks further network');
  if(url!=='https://nxgnbrdxxmlhtcnymqsl.supabase.co/rest/v1/operations_alerts?on_conflict=dedupe_key')throw Error('unapproved alert destination');
  for(const entry of JSON.parse(options.body)){
   const existing=await guardedRest(`operations_alerts?dedupe_key=eq.${encodeURIComponent(entry.dedupe_key)}&select=dedupe_key&limit=1`);
   if(!existing.length)await guardedRest('operations_alerts','POST',[entry]);
  }
  return {ok:true};
 }});
}
