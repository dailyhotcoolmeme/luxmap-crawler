import {bulgariReferenceCode} from './bulgari-product.js';
import {hermesReferenceCode} from './hermes-reference-collection.js';
export function validateOfficialReference(record,cfg){
 const brands={hermes:'bag',dior:'bag','saint-laurent':'bag',bulgari:'jewelry'};
 if(!Object.hasOwn(brands,cfg.brand)||record.brand!==cfg.brand||record.category!==brands[cfg.brand]||record.country!=='KR'||record.currency!=='KRW')throw Error('REFERENCE_CATEGORY');
 const url=new URL(record.officialUrl);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!cfg.siteHosts.includes(url.hostname)||!url.pathname.startsWith(cfg.localePrefix))throw Error('REFERENCE_URL');
 let code;
 if(cfg.brand==='bulgari')code=bulgariReferenceCode(url.href,cfg.localePrefix);
 else if(cfg.brand==='hermes')code=hermesReferenceCode(url.href);
 else if(cfg.brand==='dior')code=url.pathname.match(/\/products\/([A-Z0-9]+_[A-Z0-9]+)\/?$/)?.[1]?.replaceAll('_','');
 else code=url.pathname.match(/\/pr\/[^/]+-([A-Z0-9]{10,20})\.html$/i)?.[1]?.toUpperCase();
 if(!code||code!==record.normalizedCode||record.modelKey!==`sku-${code.toLowerCase()}`||!record.productName||!record.parentModel)throw Error('REFERENCE_IDENTITY');
 if(!(record.price===null||Number.isFinite(record.price)&&record.price>0)||!record.checkedAt||!Number.isFinite(Date.parse(record.checkedAt)))throw Error('REFERENCE_PRICE');
 if(record.imageProcessingVersion!=='original-cutout-v1'||record.imageWidth!==960||record.imageHeight!==960||!(/^[a-f0-9]{64}$/).test(record.imageSha256)||!record.imagePath||!record.sourceImageUrl)throw Error('REFERENCE_IMAGE');
 return code;
}
