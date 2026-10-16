import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'../..');
export function verifiedAcorn(){
 const project=JSON.parse(fs.readFileSync(root+'/package.json')).dependencies?.acorn?root:root+'/app';
 const require=createRequire(project+'/package.json'),file=require.resolve('acorn/package.json'),installed=JSON.parse(fs.readFileSync(file));
 const relative=path.relative(project,path.dirname(file)).split(path.sep).join('/');
 const lock=JSON.parse(fs.readFileSync(project+'/package-lock.json')),entry=lock.packages?.[relative];
 if(!relative.startsWith('node_modules/')||!entry||entry.version!==installed.version||!entry.integrity)throw Error('ACORN_LOCK_MISMATCH');
 return {version:installed.version,parse:require('acorn').parse};
}
