// Only previously normal lists, never an attempted expansion or a later denial.
export function nextLouisVuittonExpansion(runs, attempted) {
 const ordered=[...runs].sort((a,b)=>b.time-a.time);
 for(const run of ordered)for(const row of run.rows){
  const url=row.officialUrl;
  if(row.status!=='NORMAL_RENDERED_DOCUMENT_SAVED'||!/^https:\/\/kr\.louisvuitton\.com\/kor-kr\/(?:women\/handbags|men\/bags)\//.test(url)||url.includes('accessories')||attempted(url))continue;
  // A search overlay retains the category pathname. It is not evidence of
  // an expandable category grid, even when exact search cards were saved.
  if(new URL(url).searchParams.has('search'))continue;
  if(ordered.some(other=>other.time>=run.time&&other.rows.some(r=>r.officialUrl===url&&/ACCESS_BLOCKED|ACCESS_DENIED|SECURITY_VERIFICATION/.test(r.status))))continue;
  return {id:run.id,row};
 }
 return null;
}
