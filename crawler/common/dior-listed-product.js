import {parseOfficialProduct} from './dior-official-core.js';
import {diorExactListingColor} from './dior-exact-listing-color.js';
import {diorPageDataProduct} from './dior-page-data.js';
// Complete the single new KR record before image processing or publication.
// The listing helper requires exact own SKU/backend identity/title/subtitle,
// canonical, KRW and identical price. It never guesses from names or pictures.
export function diorListedProduct(body,canonical,cfg,code,listing){
 const p=parseOfficialProduct(body,canonical,cfg,code,{handbagEvidence:true});
 if(p.maintenancePriceOnly)return p;
 const own=diorPageDataProduct(body,canonical,code);if(own?.ownImageProof)p.sourceProperties={diorOwnImageProof:own.ownImageProof};
 if(!p.colorOriginal&&!p.colorDisplay&&listing){const c=diorExactListingColor(listing,body,canonical);if(c){p.colorOriginal=c.colorOriginal;p.colorDisplay=c.colorDisplay;}}
 return p;
}
