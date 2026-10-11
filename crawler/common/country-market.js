export function validCountryMarket(row,reference,config){
 if(!row||row.country_code!==config.country||row.official_product_code!==reference.normalized_code||row.currency_code!==config.currency)return false;
 if(row.current_price!==null&&(!Number.isFinite(Number(row.current_price))||Number(row.current_price)<=0))return false;
 try{const url=new URL(row.official_url);return url.origin==='https://www.chanel.com'&&url.pathname.startsWith(config.referenceDetailPrefix)&&new RegExp(config.detailPathPattern).test(url.pathname);}
 catch{return false;}
}
