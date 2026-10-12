import fs from 'node:fs';
import path from 'node:path';
const file=path.resolve(process.argv[2]),artifacts=path.dirname(file);
// Called only after the central storage adapter has verified successful writes.
for(const row of JSON.parse(fs.readFileSync(file,'utf8'))){
 if(!row.originalImagePath)continue;
 const target=path.resolve(row.originalImagePath);
 if(path.dirname(target)!==artifacts||!path.basename(target).endsWith('-original.image'))throw Error('ORIGINAL_CLEANUP_SCOPE');
 fs.unlinkSync(target);
}
