import {catalogImageKey} from './catalog-workflow.js';
export function louisVuittonImageChoice(source,held){
 if(!held)return source;
 const failed=new Set([held.imageKey,...(held.failedImageKeys??[])]);
 if(!failed.has(catalogImageKey(source)))return source;
 // Only originals already attached to this exact official sitemap product.
 for(const image of source.images.slice(1)){
  if(!/^https:\/\//.test(image.url))continue;
  const candidate={...source,images:[image,...source.images.filter(i=>i.url!==image.url)]};
  if(!failed.has(catalogImageKey(candidate)))return candidate;
 }
 const last=source.images.find(image=>catalogImageKey({images:[image]})===held.imageKey);
 return last?{...source,images:[last,...source.images.filter(i=>i.url!==last.url)]}:source;
}
