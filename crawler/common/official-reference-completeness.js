// Pure evidence audit. No filesystem, environment, clock, network or DB access.
// Contract (all identity keys are exact, already-normalized reference codes):
// discoveryIndex: {discoveryComplete, scopeVerified, references:[{code,officialUrl}],
//   knownPublishedReferences:[code|{code}], expectedCount?, sample?, limitsReached?}
// ledger: {entries:{[code]: {classification:'target'|'excluded'|'unresolved',
//   detailVerified, exactReferenceVerified, classificationEvidenceVerified,
//   failureStage?, state:'ingested'|'missing'|'unprocessed', category, officialUrl,
//   price, priceStatus, currency, image:{originalSourceVerified,cpuOfflineVerified,
//     outputVerified,processingVersion,sourceUrl,sha256,width,height,hasAlpha}}}}
// publicVerifiedFacts: {entries:{[code]: {status:'PUBLIC_CATALOG_VERIFIED',brand,
//   country,category,officialUrl,price,currency,identityVerified,priceVerified,
//   primaryImageVerified,imageSha256}}}
// safety: {guardrailsVerified:true, blocked:false, networkViolation?,tokenViolation?}
// Flags are attestations supplied by independent verifiers, never inferred here.

const brands={
 hermes:{category:'bag',host:'www.hermes.com',entry:'https://www.hermes.com/kr/ko/'},
 dior:{category:'bag',host:'www.dior.com',entry:'https://www.dior.com/ko_kr/'},
 'saint-laurent':{category:'bag',host:'www.ysl.com',entry:'https://www.ysl.com/ko-kr/'},
 bulgari:{category:'jewelry',host:'www.bulgari.com',entry:'https://www.bulgari.com/ko-kr/'},
};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const code=v=>typeof v==='string'&&/^[A-Z0-9][A-Z0-9._-]{0,119}$/i.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function https(value,host){
 if(typeof value!=='string'||value.length>500)return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(!host||u.hostname===host&&!u.search);}catch{return false;}
}
function imageVerified(image){return object(image)&&image.originalSourceVerified===true&&image.cpuOfflineVerified===true&&image.outputVerified===true&&image.processingVersion==='original-cutout-v1'&&https(image.sourceUrl)&&hash(image.sha256)&&image.width===960&&image.height===960&&image.hasAlpha===true;}
function priceValid(entry){return entry.currency==='KRW'&&(Number.isFinite(entry.price)&&entry.price>0||entry.price===null&&entry.priceStatus==='price_unavailable');}

export function auditOfficialReferenceCompleteness(input={}){
 input=object(input)?input:{};
 const cfg=Object.hasOwn(brands,input.brand)?brands[input.brand]:null,metrics={discovered:0,knownPublished:0,expected:0,coverageGap:0,unprocessed:0,classificationUnresolved:0,classificationOnlyUncertain:0,detailUnresolved:0,confirmedTarget:0,confirmedMissing:0,imageUnverified:0,publicUnverified:0,publicVerified:0,excludedVerified:0,invalid:0,safetyBlocks:0,discoveryIncomplete:0};
 const issues=new Set();
 const invalid=reason=>{metrics.invalid++;issues.add(reason);};
 if(!cfg||input.country!==undefined&&input.country!=='KR'){invalid('INVALID_BRAND_OR_COUNTRY');return finish();}
 const index=input.discoveryIndex,ledger=input.ledger,facts=input.publicVerifiedFacts,safety=input.safety;
 if(!object(index)||!object(ledger)||!object(ledger.entries)||!object(facts)||!object(facts.entries)){invalid('INVALID_INPUT_SHAPE');return finish();}
 if(!object(safety)||safety.guardrailsVerified!==true){metrics.safetyBlocks++;issues.add('SAFETY_PROOF_MISSING');}
 if(safety?.blocked||safety?.networkViolation||safety?.tokenViolation||index.safetyBlocked||index.blocked||ledger.blocked){metrics.safetyBlocks++;issues.add('SAFETY_BLOCKED');}
 for(const key of ['sample','limitsReached'])if(index[key]!==undefined&&typeof index[key]!=='boolean')invalid('DISCOVERY_FLAG_INVALID');
 if(facts.complete===false||facts.scopeVerified===false)invalid('PUBLIC_AUDIT_INCOMPLETE');
 const references=index.references,known=index.knownPublishedReferences;
 if(!Array.isArray(references)||!Array.isArray(known)||references.length>50000||known.length>50000){invalid('REFERENCE_UNIVERSE_INVALID');return finish();}
 const discovered=new Map(),universe=new Set();
 for(const ref of references){
  if(!object(ref)||!code(ref.code)||!https(ref.officialUrl,cfg.host)||!new URL(ref.officialUrl).pathname.startsWith(new URL(cfg.entry).pathname)){invalid('DISCOVERED_REFERENCE_INVALID');continue;}
  if(discovered.has(ref.code)&&discovered.get(ref.code)!==ref.officialUrl){invalid('DISCOVERY_IDENTITY_CONFLICT');continue;}
  discovered.set(ref.code,ref.officialUrl);
 }
 for(const ref of known){const value=typeof ref==='string'?ref:ref?.code;if(!code(value)){invalid('KNOWN_REFERENCE_INVALID');continue;}universe.add(value);}
 metrics.discovered=discovered.size;metrics.knownPublished=universe.size;
 for(const value of discovered.keys())universe.add(value);
 let expectedCount=universe.size;
 if(index.expectedCount!==undefined){if(!Number.isSafeInteger(index.expectedCount)||index.expectedCount<0||index.expectedCount>50000)invalid('EXPECTED_COUNT_INVALID');else if(index.expectedCount<universe.size)invalid('EXPECTED_COUNT_UNDERSTATED');else expectedCount=index.expectedCount;}
 metrics.expected=expectedCount;
 metrics.coverageGap=Math.max(0,expectedCount-discovered.size);
 const discoveryComplete=index.discoveryComplete===true&&index.scopeVerified===true&&index.sample!==true&&!index.limitsReached&&discovered.size>0&&metrics.coverageGap===0;
 if(!discoveryComplete){metrics.discoveryIncomplete=1;issues.add('DISCOVERY_INCOMPLETE');}
 for(const value of universe){
  const entry=ledger.entries[value],url=discovered.get(value);
  if(object(entry)&&(entry.safetyBlocked||entry.state==='blocked'||[entry.failureCode,entry.status,entry.image?.failureCode].some(v=>typeof v==='string'&&/BLOCKED|UNAUTHORIZED|SANDBOX|GUARD|TOKEN|NETWORK_POLICY|LIMIT/.test(v.toUpperCase())))){metrics.safetyBlocks++;issues.add('ENTRY_SAFETY_BLOCKED');}
  if(!object(entry)||entry.state==='unprocessed'){
   metrics.unprocessed++;
   if(entry!==undefined&&!object(entry))invalid('LEDGER_ENTRY_INVALID');
   continue;
  }
  if(entry.classification==='unresolved'){
   metrics.classificationUnresolved++;
   if(entry.detailVerified===true&&entry.exactReferenceVerified===true&&entry.failureStage==='classification'&&https(entry.officialUrl,cfg.host)&&entry.officialUrl===url)metrics.classificationOnlyUncertain++;
   else metrics.detailUnresolved++;
   continue;
  }
  if(entry.classification!=='target'&&entry.classification!=='excluded'){
   metrics.classificationUnresolved++;metrics.detailUnresolved++;invalid('CLASSIFICATION_PROOF_MISSING');continue;
  }
  const identity=entry.detailVerified===true&&entry.exactReferenceVerified===true&&entry.classificationEvidenceVerified===true&&entry.officialUrl===url&&https(entry.officialUrl,cfg.host);
  if(!identity){metrics.detailUnresolved++;invalid('DETAIL_OR_CLASSIFICATION_INVALID');continue;}
  if(entry.classification==='excluded'){
   if(entry.state!=='excluded'||entry.exclusionReasonVerified!==true){invalid('EXCLUSION_PROOF_MISSING');metrics.classificationUnresolved++;}
   else metrics.excludedVerified++;
   continue;
  }
  metrics.confirmedTarget++;
  if(entry.category!==cfg.category||!priceValid(entry)){invalid('TARGET_METADATA_INVALID');continue;}
  const ingested=entry.state==='ingested',imageOk=imageVerified(entry.image);
  if(!ingested)metrics.confirmedMissing++;
  if(!imageOk)metrics.imageUnverified++;
  const fact=facts.entries[value];
  const publicOk=object(fact)&&fact.status==='PUBLIC_CATALOG_VERIFIED'&&fact.brand===input.brand&&fact.country==='KR'&&fact.category===cfg.category&&fact.officialUrl===entry.officialUrl&&fact.currency==='KRW'&&fact.price===entry.price&&fact.identityVerified===true&&fact.priceVerified===true&&fact.primaryImageVerified===true&&fact.imageSha256===entry.image?.sha256&&fact.snapshotLinked!==false;
  if(!publicOk)metrics.publicUnverified++;
  if(ingested&&imageOk&&publicOk)metrics.publicVerified++;
 }
 // Count unnamed references promised by expectedCount as unprocessed too.
 metrics.unprocessed+=Math.max(0,expectedCount-universe.size);
 return finish();

 function finish(){
  const hardFailure=metrics.invalid>0||metrics.safetyBlocks>0||metrics.discoveryIncomplete>0||metrics.coverageGap>0||metrics.unprocessed>0||metrics.detailUnresolved>0||metrics.confirmedMissing>0||metrics.imageUnverified>0||metrics.publicUnverified>0||metrics.confirmedTarget!==metrics.publicVerified;
  const classificationOnly=metrics.classificationUnresolved>0&&metrics.classificationUnresolved===metrics.classificationOnlyUncertain;
  const complete=!hardFailure&&metrics.classificationUnresolved===0&&metrics.discovered>0;
  const exitCode=complete?0:!hardFailure&&classificationOnly?2:1;
  const statuses=[complete?'WHOLE_COMPLETE':exitCode===2?'CLASSIFICATION_ONLY_INCOMPLETE':'WHOLE_INCOMPLETE',...Object.entries(metrics).map(([key,n])=>`${key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()).toUpperCase()}_${n}`),...issues];
  const summary=cfg?statuses.map(status=>({brand:input.brand,country:'KR',parentModel:'한국 공식 상품 전체 완료 검증',variantCode:'AUDIT',price:null,currency:'KRW',status,officialUrl:cfg.entry})):[];
  // Both outputs contain aggregate facts only, never product lists or input text.
  const result={complete,exitCode,metrics,summary};
  if(new TextEncoder().encode(JSON.stringify(result)).length>32768)throw Error('AUDIT_METRICS_LIMIT');
  return result;
 }
}
