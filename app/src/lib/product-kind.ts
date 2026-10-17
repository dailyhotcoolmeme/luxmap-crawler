export type ProductKind='bag'|'jewelry'|'watch';
type ProductIdentity={kind?:ProductKind;brandSlug?:string;brand?:string;brandOriginal?:string;prices?:{officialUrl:string}[]};
// Only registered Korean reference categories; no name-based product guessing.
export function productKind(product?:ProductIdentity):ProductKind {
 if(product?.kind)return product.kind;
 if(product?.brandSlug==='van-cleef-arpels'||product?.brandSlug==='bulgari')return 'jewelry';
 if(product?.brandSlug==='rolex')return 'watch';
 const names=[product?.brand,product?.brandOriginal].map(v=>(v??'').normalize('NFKC').replace(/\s/g,'').toLowerCase());
 if(names.some(v=>v==='롤렉스'||v==='rolex'))return 'watch';
 if(names.some(v=>v==='반클리프아펠'||v==='vancleef&arpels'||v==='불가리'||v==='bulgari'||v==='bvlgari'))return 'jewelry';
 return 'bag';
}
