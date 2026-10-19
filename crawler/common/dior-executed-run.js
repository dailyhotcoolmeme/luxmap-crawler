import fs from 'node:fs';import path from 'node:path';
// Prepared sources are not executed workers, including in the same second
// and after PID wrap. Never select them as an ingestion output directory.
export function latestExecutedDiorRun(base){
 const runs=fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&/^\d{8}T\d{6}Z-\d+$/.test(d.name)).map(d=>({file:path.join(base,d.name),created:fs.statSync(path.join(base,d.name)).birthtimeMs}));
 if(!runs.length)throw Error('EXECUTED_DIOR_RUN_MISSING');runs.sort((a,b)=>a.created-b.created||a.file.localeCompare(b.file));return runs.at(-1).file;
}
