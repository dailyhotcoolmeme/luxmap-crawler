import {pradaModelProductLinks} from './prada-product.js';
export function pradaCountrySitemapLinks(locations,source,country,prefix){
 const links=new Map();
 for(const [code,url]of pradaModelProductLinks(locations,source,country)){
  if(new URL(url).pathname.startsWith(prefix))links.set(code,url);
 }
 return links;
}
