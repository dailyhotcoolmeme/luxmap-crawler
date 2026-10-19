import path from 'node:path';import {latestExecutedDiorRun} from '../crawler/common/dior-executed-run.js';
const root=path.resolve(import.meta.dirname,'..');if(process.argv.length!==2)throw Error('DIOR_RUN_SELECTION_SCOPE');process.stdout.write(latestExecutedDiorRun(root+'/crawler/runs/dior/kr'));
