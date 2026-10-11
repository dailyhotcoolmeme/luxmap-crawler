import assert from 'node:assert/strict';
import {validCountryMarket} from '../crawler/common/country-market.js';
const config={country:'ES',currency:'EUR',referenceDetailPrefix:'/es/moda/p/',detailPathPattern:'^/es/moda/p/[A-Za-z0-9]+/'};
const reference={normalized_code:'TEST123'};
const row={country_code:'ES',currency_code:'EUR',official_product_code:'TEST123',current_price:10000,official_url:'https://www.chanel.com/es/moda/p/TEST123/bag/'};
assert.equal(validCountryMarket(row,reference,config),true);
assert.equal(validCountryMarket({...row,current_price:null},reference,config),true);
for(const patch of [{country_code:'US'},{currency_code:'USD'},{official_product_code:'OTHER'},{current_price:0},{current_price:-1},{current_price:'NaN'},{official_url:'https://www.chanel.com/kr/fashion/p/TEST123/bag/'},{official_url:'https://example.com/es/moda/p/TEST123/bag/'}])assert.equal(validCountryMarket({...row,...patch},reference,config),false);
console.log('PASS: country coverage requires exact Korean SKU, currency, official URL and valid price.');
