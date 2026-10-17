import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export function validRegisteredLouisVuitton(p){
 const markets=p.market_products?.filter(m=>m.country_code==='KR')??[],media=p.product_media?.filter(m=>m.is_primary)??[],m=markets[0],code=p.normalized_code;
 if(!/^[A-Z0-9]{5,16}$/.test(code??'')||markets.length!==1||media.length!==1||m.official_product_code!==code||m.currency_code!=='KRW'||m.price_status!=='confirmed'||!(Number(m.current_price)>0))return null;
 const u=new URL(m.official_url);if(u.origin!=='https://kr.louisvuitton.com'||u.search||u.hash||u.username||u.password||!u.pathname.startsWith('/kor-kr/products/')||u.pathname.split('/').at(-1)!==code)return null;
 if(!media[0].r2_object_key?.startsWith('products/louis-vuitton/sku-'+code.toLowerCase()+'/'+code+'/cutout-v1/')||!/[a-f0-9]{64}\.webp$/.test(media[0].r2_object_key))return null;
 return {code,id:p.id,url:m.official_url,price:Number(m.current_price),imageKey:media[0].r2_object_key};
}
export function readRegisteredLouisVuitton(root){
 const dir=root+'/crawler/completeness/louis-vuitton/registered-reference-source';if(!fs.existsSync(dir+'/summary.json'))return [];
 if(spawnSync(root+'/scripts/crawl-output-guard.sh',[dir+'/summary.json'],{stdio:'ignore'}).status)throw Error('REGISTERED_SOURCE_GUARD');
 const bytes=fs.readFileSync(dir+'/references.json'),meta=JSON.parse(fs.readFileSync(dir+'/manifest.json'));
 if(bytes.length>8388608||meta.sha256!==createHash('sha256').update(bytes).digest('hex')||Date.now()-Date.parse(meta.checkedAt)>3600000)throw Error('REGISTERED_SOURCE_INTEGRITY');
 const data=JSON.parse(bytes);if(!Array.isArray(data)||data.length>10000||new Set(data.map(r=>r.code)).size!==data.length)throw Error('REGISTERED_SOURCE_SCOPE');return data;
}
