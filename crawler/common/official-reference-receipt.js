import {validateOfficialReference} from './official-reference-validation.js';
// Called only after independent storage bytes/hash and anonymous DB validation.
// Legacy records without these processing-time proofs remain unreceipted.
export function officialReferenceReceipt(record,cfg){
 const code=validateOfficialReference(record,cfg),r=record.referenceProof,i=record.imageProof;
 if(!r||r.schema!==1||r.exactReferenceVerified!==true||r.classificationEvidenceVerified!==true||r.countryCurrencyVerified!==true||r.brand!==record.brand||r.category!==record.category||r.country!==record.country||r.currency!==record.currency||r.code!==code||r.officialUrl!==record.officialUrl)return null;
 if(!i||i.schema!==1||i.originalSourceVerified!==true||i.cpuOfflineVerified!==true||i.outputVerified!==true||i.processingVersion!=='original-cutout-v1'||i.sourceUrl!==record.sourceImageUrl||!/^[a-f0-9]{64}$/.test(i.sourceSha256??'')||i.sha256!==record.imageSha256||i.width!==960||i.height!==960||i.hasAlpha!==true)return null;
 return {ledger:{classification:'target',state:'ingested',detailVerified:true,exactReferenceVerified:true,classificationEvidenceVerified:true,category:record.category,officialUrl:record.officialUrl,price:record.price,priceStatus:record.priceStatus,currency:record.currency,image:{...i}},public:{status:'PUBLIC_CATALOG_VERIFIED',brand:record.brand,country:record.country,category:record.category,officialUrl:record.officialUrl,price:record.price,currency:record.currency,identityVerified:true,priceVerified:true,primaryImageVerified:true,imageSha256:record.imageSha256}};
}
