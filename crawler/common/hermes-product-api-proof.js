import {createHash} from 'node:crypto';

const TARGET='https://bck.hermes.com/product?productsku=H073428CKO5';
const SOURCES=Object.freeze({
 html:Object.freeze({path:'crawler/runs/hermes/kr/20261014T150529Z-85321/raw/1.source',summaryPath:'crawler/runs/hermes/kr/20261014T150529Z-85321/summary.json',officialUrl:'https://www.hermes.com/kr/ko/product/lindy-26-%EB%B0%B1-H073428CKO5/',guardStatus:'SCHEMA_OFFER',sha256:'b9f3805c01a5f8bf2d9a90cad43f20f2e6f4d4a6cf0ba8eee984f4e96facf415',variantCode:'H073428CKO5',currency:'KRW'}),
 main:Object.freeze({path:'crawler/runs/hermes/kr/20261014T163806Z-77800/raw/published-script.source',summaryPath:'crawler/runs/hermes/kr/20261014T163806Z-77800/summary.json',officialUrl:'https://www.hermes.com/kr/ko/main.512d3bc35b6ae972.js',guardStatus:'SCRIPT_FETCH_HTTP_200',sha256:'51d4be90e86e93f13122a142e0846f1867f036124c877cb8f3791b00bdcef7cb'}),
 facade:Object.freeze({path:'crawler/runs/hermes/kr/20261014T171137Z-4752/dependencies/026/raw/published-script.source',summaryPath:'crawler/runs/hermes/kr/20261014T171137Z-4752/dependencies/026/summary.json',officialUrl:'https://www.hermes.com/kr/ko/3869.77c45a38eaa3a9af.js',guardStatus:'SCRIPT_FETCH_HTTP_200',provenanceStatus:'PUBLISHED_PRODUCT_CHUNK',sha256:'6c689115fd76fb45b720e7e7478fa69f4e9eff6a5e4035a951e922dd2c60d6a4'}),
});
// Inventory is not authorization. Caller enforces guard/freshness/transport.
export function hermesProductApiSourceFiles(){return SOURCES;}
function hash(value){
 if(typeof value!=='string'&&!Buffer.isBuffer(value))throw Error('API_SOURCE_TYPE');
 if(Buffer.byteLength(value)>8388608)throw Error('API_SOURCE_LIMIT');
 return createHash('sha256').update(value).digest('hex');
}
// Frozen offline AST attestation: CSR false branch selects backendCSR;
// facade fetchProductWithSku GETs apiUrl + /product with a params binding
// productsku=encodeURIComponent(argument). No runtime JS evaluation.
// Detail HTML explicitly contains Product schema SKU H073428CKO5 and BCK base.
// IMPORTANT: its canonical instead names H073428CK18. Canonical is NOT used as
// proof of O5 identity; the exact Product schema is. No CK18 substitution.
export function validateHermesProductApi(html,main,facade,target){
 if(target!==TARGET)return false;
 if(hash(main)!==SOURCES.main.sha256)throw Error('API_MAIN_HASH_MISMATCH');
 // Caller scans bounded, guarded child sources; unrelated facades are normal.
 if(hash(facade)!==SOURCES.facade.sha256)return false;
 try{return hash(html)===SOURCES.html.sha256;}catch{return false;}
}
