// Brand adapters supply evidence; the central store owns this shared contract.
// Explicit null means unresolved, never proof that the official site omits it.
export const catalogAttributeColumns = Object.freeze({
  materialDisplay:'material_ko', materialOriginal:'material_original',
  colorDisplay:'color_ko', colorOriginal:'color_original',
  widthMm:'width_mm', heightMm:'height_mm', depthMm:'depth_mm',
});
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
export function validateKoreanCatalogRecord(record,brand) {
  if(record?.country!=='KR'||record.currency!=='KRW'||record.brand&&record.brand!==brand)throw Error('CATALOG_KR_IDENTITY');
  for(const key of ['normalizedCode','originalCode','modelKey','productName','parentModel','officialUrl','sourceImageUrl','imagePath'])
    if(!nonempty(record[key]))throw Error('CATALOG_REQUIRED_FIELD');
  for(const key of Object.keys(catalogAttributeColumns)){
    if(!Object.hasOwn(record,key)||record[key]===undefined)throw Error('CATALOG_ATTRIBUTE_NOT_COLLECTED');
    const value=record[key];
    if(value!==null&&(key.endsWith('Mm')?!(Number.isFinite(value)&&value>0):!nonempty(value)))throw Error('CATALOG_ATTRIBUTE_INVALID');
  }
  if(!(record.price===null||Number.isFinite(record.price)&&record.price>0)||!Number.isFinite(Date.parse(record.checkedAt)))throw Error('CATALOG_PRICE_INVALID');
  if(record.imageProcessingVersion!=='original-cutout-v1'||!(/^[a-f0-9]{64}$/).test(record.imageSha256)||record.imageWidth!==960||record.imageHeight!==960)throw Error('CATALOG_IMAGE_INVALID');
  return catalogAttributeState(record);
}
export function catalogAttributeState(record){
  return Object.fromEntries(Object.keys(catalogAttributeColumns).map(key=>[key,
    !Object.hasOwn(record,key)||record[key]===undefined?'not_collected':record[key]===null?'unresolved':'collected']));
}
export function preserveKnownCatalogAttributes(payload,previous){
  const next={...payload};
  for(const column of Object.values(catalogAttributeColumns))
    if(next[column]==null&&previous?.[column]!=null)next[column]=previous[column];
  return next;
}
export function verifyPublicCatalogAttributes(expected,rows){
  if(!Array.isArray(rows)||rows.length!==1)throw Error('CATALOG_PUBLIC_IDENTITY');
  const actual=rows[0];
  for(const column of ['normalized_code','name_ko','name_original',...Object.values(catalogAttributeColumns)]){
    const wanted=expected[column]??null,observed=actual[column]??null;
    if(column.endsWith('_mm')&&wanted!==null&&observed!==null){
      if(Number(wanted)===Number(observed))continue;
    }else if(wanted===observed)continue;
    throw Error('CATALOG_PUBLIC_FIELD_MISMATCH');
  }
  return true;
}
