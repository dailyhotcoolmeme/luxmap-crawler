// A successful phase is not a whole-catalog attestation. Independent discovery
// and public snapshot audits remain separate required jobs in the full plan.
export function domesticPhaseResult({targetCodes,verifiedCodes,failed=false,sample=false}) {
  const targets=new Set(targetCodes),verified=new Set(verifiedCodes);
  const missing=[...targets].filter(code=>!verified.has(code)).length;
  const unexpected=[...verified].some(code=>!targets.has(code));
  const complete=!failed&&!unexpected&&missing===0;
  return {complete,missing,exitCode:complete?0:2,status:sample?'SAMPLE_NOT_FULL_CATALOG':complete?'PHASE_SCOPE_VERIFIED':'PHASE_SCOPE_INCOMPLETE'};
}
