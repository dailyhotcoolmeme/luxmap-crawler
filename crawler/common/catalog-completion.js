// Batch success, a verified subset, and exhaustion of one transport are not
// evidence that the complete official catalogue was collected.
export function catalogCompletion(rows,expected,ready=0,held=0){
 const count=prefix=>{const found=rows.filter(r=>r.status.startsWith(prefix));if(found.length!==1)return null;const value=found[0].status.slice(prefix.length);return /^\d+$/.test(value)?Number(value):null;};
 const verified=count('PUBLIC_VERIFIED_'),priced=count('PRICE_CONFIRMED_'),images=count('IMAGE_LINK_VERIFIED_'),snapshot=count('PUBLIC_SNAPSHOT_LINKS_');
 const complete=Number.isInteger(expected)&&expected>0&&ready===0&&verified===expected&&priced===expected&&images===expected&&snapshot===expected&&count('SOURCE_CANDIDATES_')===expected&&count('PRICE_UNVERIFIED_')===0&&count('UNRESOLVED_')===0&&rows.some(r=>r.status==='FULL_KNOWN_CATALOG_SCOPE')&&rows.some(r=>r.status==='FULL_CATALOG_AUDIT_VERIFIED')&&!rows.some(r=>['FULL_COLLECTION_INCOMPLETE','SOURCE_SUBSET_NOT_WHOLE_CATALOG','DISCOVERY_AUDIT_REQUIRED'].includes(r.status));
 return {complete,remaining:Number.isInteger(verified)&&Number.isInteger(expected)?Math.max(0,expected-verified):null,next:complete?'COMPLETE':ready>held?'INGEST_READY':held>0?'FOLLOWUP_IMAGE_EVIDENCE_REQUIRED':'FOLLOWUP_SOURCE_REQUIRED'};
}
