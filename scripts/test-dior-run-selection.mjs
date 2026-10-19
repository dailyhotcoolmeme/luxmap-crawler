import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {latestExecutedDiorRun} from '../crawler/common/dior-executed-run.js';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dior-run-selection-'));
try{fs.mkdirSync(dir+'/20261019T030000Z-100');fs.mkdirSync(dir+'/20261019T030000Z-99999-cached-0');assert.equal(path.basename(latestExecutedDiorRun(dir)),'20261019T030000Z-100');fs.mkdirSync(dir+'/00000000T000000Z-catalog-sources');assert.equal(path.basename(latestExecutedDiorRun(dir)),'20261019T030000Z-100');}finally{fs.rmSync(dir,{recursive:true,force:true});}
console.log('PASS: prepared/cached sources never replace the executed Dior worker, including same-second PID wrap');
