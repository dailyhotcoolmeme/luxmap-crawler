import crypto from 'node:crypto';
// Manufacturer names remain authoritative. Only an explicit size prefix is
// removed; clutch/tote/shoulder constructions and unknown names are not merged.
export function bottegaModel(productName){
 const name=String(productName).normalize('NFKC').replace(/\s+/g,' ').trim();
 if(!name||name.length>120)throw Error('MODEL_NAME_UNVERIFIED');
 const parentModel=name.replace(/^(?:미니|스몰|미디엄|라지|맥시|베이비)\s+/,'');
 return{parentModel,modelKey:`name-${crypto.createHash('sha256').update(parentModel).digest('hex').slice(0,20)}`};
}
