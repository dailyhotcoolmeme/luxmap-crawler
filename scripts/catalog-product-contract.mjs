#!/usr/bin/env node
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {validateKoreanCatalogRecord,preserveKnownCatalogAttributes,verifyPublicCatalogAttributes} from '../crawler/common/catalog-product-contract.js';
const [mode,file,other,output]=process.argv.slice(2),read=p=>JSON.parse(fs.readFileSync(p));
try{
  if(mode==='validate'){
    const records=read(file);
    if(!Array.isArray(records)||!records.length)throw Error('CATALOG_EMPTY_BATCH');
    const seen=new Set(),rows=[];
    for(const record of records){
      const states=validateKoreanCatalogRecord(record,other);
      if(seen.has(record.normalizedCode))throw Error('CATALOG_DUPLICATE_SKU');
      seen.add(record.normalizedCode);
      const unresolved=Object.values(states).filter(value=>value==='unresolved').length;
      rows.push({brand:other,country:'KR',parentModel:'통합 상품 필드 검사',variantCode:record.normalizedCode,price:record.price,currency:'KRW',status:unresolved?`ATTRIBUTES_UNRESOLVED_${unresolved}`:'ATTRIBUTES_COLLECTED',officialUrl:record.officialUrl});
    }
    fs.writeFileSync(output,JSON.stringify(rows),{mode:0o600});
    if(spawnSync(new URL('./crawl-output-guard.sh',import.meta.url).pathname,[output],{stdio:'ignore'}).status!==0)throw Error('CATALOG_SUMMARY_GUARD');
  }else if(mode==='merge'){
    fs.writeFileSync(output,JSON.stringify(preserveKnownCatalogAttributes(read(file),read(other)[0])),{mode:0o600});
  }else if(mode==='verify')verifyPublicCatalogAttributes(read(file),read(other));
  else throw Error('CATALOG_CONTRACT_MODE');
}catch(error){
  console.error(/^[A-Z0-9_]{1,48}$/.test(error.message)?error.message:'CATALOG_CONTRACT_FAILED');
  process.exitCode=1;
}
