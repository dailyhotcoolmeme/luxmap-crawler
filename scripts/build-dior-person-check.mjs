import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..'),source=root+'/crawler/common/dior-person-check.swift',binary=root+'/.image-runtime/dior-person-check';
const child=spawnSync('/usr/bin/xcrun',['swiftc',source,'-o',binary],{stdio:'ignore',timeout:60000});if(child.status!==0)throw Error('DIOR_PERSON_BUILD_FAILED');
const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
fs.writeFileSync(binary+'.json',JSON.stringify({sourceSha256:hash(source),binarySha256:hash(binary),cpuOnly:true}),{mode:0o600});
console.log('PASS: offline CPU detector built and pinned');
