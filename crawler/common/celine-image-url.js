const normalizeCeline=value=>String(value??'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
// expectedCode must come from the independently checked official Product SKU.
// No inferred asset IDs, other hosts, transformation rewrites, or SKU substitutes.
export function celineOriginalImageUrl(value,expectedCode){
 const u=new URL(value),code=normalizeCeline(expectedCode);
 if(u.protocol!=='https:'||u.hostname!=='image.celine.com'||u.username||u.password||u.port||u.hash||u.search||!/^[A-Z0-9]{13}$/.test(code))throw Error('CELINE_ORIGINAL_IMAGE_REFERENCE');
 if(!/^\/asset\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/[A-Z0-9]{9}[.-][A-Z0-9]{4}_[A-Z0-9_]+\.(?:jpg|jpeg|png|webp)$/i.test(u.pathname))throw Error('CELINE_IMAGE_SOURCE_PATH');
 const filename=u.pathname.split('/').at(-1),m=filename.match(/^([A-Z0-9]{9})[.-]?([A-Z0-9]{4})(?:[_-][A-Z0-9._-]+)?\.(?:jpg|jpeg|png|webp)$/i);
 if(!m||normalizeCeline(m[1]+m[2])!==code)throw Error('CELINE_IMAGE_SOURCE_SKU');
 return u.href;
}
