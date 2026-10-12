import {normalizeProductCode} from './product-normalizer.js';
import {pradaOfficialAmount} from './prada-product.js';
export function exactPradaModelPrice(model,expected,config){
 const amounts=new Set();
 const visit=(value,key='')=>{
  if(/stock|inventory|availability|discount|coupon/i.test(key))return;
  if(typeof value==='string'&&/^[\[{]/.test(value.trim())){try{visit(JSON.parse(value));}catch{}return;}
  if(!value||typeof value!=='object')return;
  const code=value.sku??value.productCode??value.productID??value.code??value.itemCode;
  if(typeof code==='string'&&normalizeProductCode(code)===expected){
   const raw=value.price??value.productPrice??value.priceValue;
   const price=raw&&typeof raw==='object'?(raw.value??raw.amount??raw.price):raw;
   const currency=(raw&&typeof raw==='object'?(raw.currency??raw.currencyCode??raw.priceCurrency):null)??value.priceCurrency??value.currencyCode??value.currency;
   // Exact SKU alone is insufficient: require an explicit currency. Do not
   // borrow a neighbouring variant's amount or infer from a generic "$".
   if(currency===config.currency&&(typeof price==='number'||typeof price==='string')){
    const amount=pradaOfficialAmount(price,config.locale);
    if(Number.isFinite(amount)&&amount>0)amounts.add(amount);
   }
  }
  for(const[k,v]of Object.entries(value))visit(v,k);
 };visit(model);
 if(amounts.size>1)throw Object.assign(Error('conflicting exact model prices'),{failureCode:'MODEL_PRICE_CONFLICT'});
 return amounts.size===1?[...amounts][0]:null;
}
