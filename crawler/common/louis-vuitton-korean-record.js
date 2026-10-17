import {catalogModelImages} from './louis-vuitton-catalog-model.js';
import {cleanLouisVuittonName,louisVuittonBoundFields,louisVuittonDescriptionFields,louisVuittonDimensions} from './louis-vuitton-metadata.js';
import {originalImageUrl} from './image-processor.js';
// Parse the exact SKU once. Never use a sibling or the family container's
// material/colour/size as a fallback. Image processing stays in the central CPU path.
export function koreanModelRecord(data,cfg,priceRecord){
 if(cfg.country!=='KR'||cfg.currency!=='KRW'||priceRecord.country!=='KR')throw Error('KOREAN_RECORD_SCOPE');
 const code=priceRecord.normalizedCode,models=(Array.isArray(data?.model)?data.model:[]).filter(m=>m?.identifier===code);
 if(models.length!==1)throw Error('EXACT_KOREAN_MODEL_REQUIRED');
 const model=models[0],named=v=>typeof v==='string'&&v.trim()&&!/[<>]/.test(v)?v.trim():v&&typeof v==='object'?(typeof v.name==='string'?v.name:typeof v.value==='string'?v.value:null):null;
 const name=cleanLouisVuittonName(named(model.name)??named(data.name)??'');
 const fields={...louisVuittonDescriptionFields(model.detailedDescription??model.description),...louisVuittonBoundFields(model,code),...louisVuittonDimensions(model.dimensions)};
 for(const key of ['color','material']){
  const direct=named(model[key]??(key==='material'?model.mainMaterial:undefined));if(direct)fields[key]=direct;
  for(const holder of [model.attributes,model.sku].flat().filter(v=>v&&typeof v==='object'))if(!fields[key])fields[key]=named(holder[key]);
 }
 for(const axis of ['width','height','depth']){const v=model[axis],unit=String(v?.unitCode??v?.unitText??'').toLowerCase(),n=Number(v?.value);if(n>0&&Number.isFinite(n)&&['mm','mmt','cm','cmt'].includes(unit))fields[axis+'Mm']=n*(unit.startsWith('c')?10:1);}
 const images=catalogModelImages([model],{code,url:priceRecord.officialUrl,name},cfg);
 if(!images.length)throw Error('OFFICIAL_IMAGE_MISSING');
 return {...priceRecord,category:'bag',styleCode:code,modelKey:'sku-'+code.toLowerCase(),parentModel:name,productName:name,sourceImageUrl:originalImageUrl(images[0].url,code),
  colorOriginal:fields.color??null,colorDisplay:fields.color??null,materialOriginal:fields.material??null,materialDisplay:fields.material??null,
  widthMm:fields.widthMm??null,heightMm:fields.heightMm??null,depthMm:fields.depthMm??null};
}
