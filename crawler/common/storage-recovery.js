// Only retry the curl process codes for connection interruption/timeouts.
// Replaying is safe only for the existing read-before-upsert storage adapter.
export function runIdempotentStorage(run){
 let result;
 for(let attempt=0;attempt<=2;attempt++){
  result=run();
  if(![7,28,52,56].includes(result.status)||attempt===2)break;
 }
 return result;
}
