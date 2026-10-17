import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const parserFiles=['scripts/louis-vuitton-serialized-data.mjs','scripts/recover-louis-vuitton-metadata.mjs','crawler/common/louis-vuitton-product.js','crawler/common/louis-vuitton-metadata.js','crawler/common/celine-html.js','crawler/common/verified-lv-acorn.js'];
const parserKey=createHash('sha256').update(parserFiles.map(f=>fs.readFileSync(root+'/'+f)).join('\n')).digest('hex');
const memo=new Map();
export function sourceFingerprint(dir){
 const country=path.basename(path.dirname(dir));if(!/^\d{8}T\d{6}Z-\d+$/.test(path.basename(dir))||!['kr','us'].includes(country)||path.dirname(dir)!==root+'/crawler/runs/louis-vuitton/'+country)throw Error('SOURCE_SCOPE');
 const config=fs.readFileSync(root+'/crawler/brands/louis-vuitton/countries/'+country),summary=fs.readFileSync(dir+'/summary.json'),files=fs.readdirSync(dir+'/raw').filter(f=>/^(?:api-)?\d+\.source$/.test(f)).sort(),hash=createHash('sha256').update(parserKey).update(config).update(summary),stats=files.map(name=>fs.lstatSync(dir+'/raw/'+name));
 if(stats.some(s=>s.size>8388608||!s.isFile()))throw Error('SOURCE_LIMIT');
 const stamp=JSON.stringify([createHash('sha256').update(config).update(summary).digest('hex'),...stats.map((s,i)=>[files[i],s.size,s.mtimeMs])]);if(memo.get(dir)?.stamp===stamp)return memo.get(dir).key;
 for(const name of files){const f=dir+'/raw/'+name,stat=fs.statSync(f),mode=stat.mode&0o777;try{fs.chmodSync(f,0o600);hash.update(name).update(fs.readFileSync(f));}finally{fs.chmodSync(f,mode);}}
 const key=hash.digest('hex');memo.set(dir,{stamp,key});return key;
}
export function materializedFingerprint(dir){
 const hash=createHash('sha256');for(const name of ['objects.json','cards.json','summary.json'])hash.update(name).update(fs.readFileSync(dir+'/artifacts/native-metadata/'+name));return hash.digest('hex');
}
