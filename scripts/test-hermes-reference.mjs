import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {hermesReferenceCode,hermesReferenceLinks,publishedHermesSearch,hermesRenderChallenge} from '../crawler/common/hermes-reference-collection.js';
import {declaredCountrySitemapUrls} from '../crawler/common/van-cleef-foreign.js';
import {parseOfficialProduct} from '../crawler/common/hermes-collection.js';
const base='https://www.hermes.com/kr/ko/category/leather-goods/bags-and-clutches/womens-bags-and-clutches/';
assert.equal(hermesRenderChallenge('<script src="https://js.datadome.co/tags.js"></script><a href="/product/example">Product</a>'),false);
for(const html of ['<title>Access Denied</title>','<iframe src="https://geo.captcha-delivery.com/captcha/">','Verify you are human','<div id="px-captcha">'])assert.equal(hermesRenderChallenge(html),true);
const links=hermesReferenceLinks(`<link href="assets/images/favicon/favicon.png"><a href="?page=2">next</a><a href="?facet_color=noir">facet</a><a href="/kr/ko/product/lindy-26-H073428CKO5/">bag</a><a href="https://www.hermes.com/us/en/product/lindy-26-H073428CKO5/">foreign</a><a href="https://evil.test/kr/ko/product/lindy-26-H073428CKO5/">other</a>`,base,{localePrefix:'/kr/ko/'});
assert.equal(links.product.size,1);assert(links.product.has('H073428CKO5'));
assert.deepEqual([...links.listings],[base+'?page=2']);
assert.equal(hermesReferenceCode(base),null);assert.equal(hermesReferenceCode('https://www.hermes.com/kr/ko/product/a-H073428CKO5/'),'H073428CKO5');
const cfg={brand:'hermes',country:'JP',currency:'JPY',localePrefix:'/jp/ja/',entryUrl:'https://www.hermes.com/jp/ja/',allowedHosts:['www.hermes.com'],productPathPattern:'/product/',skuPattern:'[A-Z0-9]{8,20}',stylePattern:'^([A-Z0-9]{6,12})'};
const productUrl='https://www.hermes.com/jp/ja/product/lindy-H073428CKO5/',calls=[];
assert.equal(publishedHermesSearch('<form action="/jp/ja/search/" method="get"><input name="s"></form>',cfg),'https://www.hermes.com/jp/ja/search/');
for(const action of ['https://evil.invalid/jp/ja/search/','/us/en/search/'])assert.throws(()=>publishedHermesSearch(`<form action="${action}"><input name="s"></form>`,cfg),/PUBLISHED_SEARCH/);
assert.throws(()=>publishedHermesSearch('<form action="/jp/ja/search/" method="post"><input name="s"></form>',cfg),/PUBLISHED_SEARCH/);
const sources=new Map([['https://www.hermes.com/robots.txt','Sitemap: https://www.hermes.com/kr/ko/sitemap_index.xml\nSitemap: https://www.hermes.com/jp/ja/sitemap_index.xml'],['https://www.hermes.com/jp/ja/sitemap_index.xml','<sitemapindex><sitemap><loc>https://www.hermes.com/jp/ja/products.xml</loc></sitemap></sitemapindex>'],['https://www.hermes.com/jp/ja/products.xml',`<urlset><url><loc>${productUrl}</loc></url><url><loc>https://www.hermes.com/us/en/product/lindy-H073428CKO5/</loc></url></urlset>`]]);
assert.deepEqual(await declaredCountrySitemapUrls(async url=>{calls.push(url);assert(sources.has(url));return {html:sources.get(url)};},cfg),[productUrl]);
assert.equal(calls.length,3);assert(!calls.some(url=>url.includes('/kr/')));
const html=(currency='JPY',sku='H073428CKO5')=>`<script type="application/ld+json">${JSON.stringify({'@type':'Product',sku,name:'Lindy',offers:{price:1500000,priceCurrency:currency}})}</script>`;
assert.equal(parseOfficialProduct(html(),productUrl,cfg,{priceOnly:true,expectedCode:'H073428CKO5'}).price,1500000);
assert.throws(()=>parseOfficialProduct(html('KRW'),productUrl,cfg,{priceOnly:true,expectedCode:'H073428CKO5'}),/CURRENCY/);
assert.throws(()=>parseOfficialProduct(html('JPY','H073428CK89'),productUrl,cfg,{priceOnly:true,expectedCode:'H073428CKO5'}),/EXACT_SKU/);
// A safety failure may deliberately produce no crawl summary. Never downgrade
// exit78 to SUMMARY_GUARD and accidentally continue to the next country.
const wrapper=fs.readFileSync(new URL('./official-brand-reference.mjs',import.meta.url),'utf8').replace(/^import .*$/gm,'').replaceAll('import.meta.dirname','__dirname');
for(const mode of ['--prices-country','--prices-facet-country','--prices-render-country']){
 const files=new Map();let runs=0,stopped;
 const fakeFs={mkdirSync(){},existsSync(){return false;},writeFileSync(f,s){files.set(f,s);},readFileSync(f){if(files.has(f))return files.get(f);if(f.includes('/countries/'))return JSON.stringify({country:'JP',currency:'JPY',entryUrl:'https://www.hermes.com/jp/ja/'});throw Object.assign(Error('missing'),{code:'ENOENT'});},readdirSync(){throw Error('POST_SAFETY_READ_FORBIDDEN');}};
 const stop=Error('expected safety stop');
 try{vm.runInNewContext(wrapper,{__dirname:import.meta.dirname,path,fs:fakeFs,spawnSync(file){if(file.endsWith('crawl-output-guard.sh'))return {status:0};runs++;return {status:78};},process:{env:{LUXURY_SERVICE_GUARD:'enabled'},argv:['node','worker','hermes',mode,'all'],exit(code){stopped=code;throw stop;}}});}catch(e){assert.equal(e,stop);}
 assert.equal(stopped,78);assert.equal(runs,1,'no second country after safety failure');
 stopped=undefined;
 try{vm.runInNewContext(wrapper,{__dirname:import.meta.dirname,path,fs:{existsSync(f){return f.endsWith('/foreign-safety-stop.json');}},spawnSync(){throw Error('PERSISTED_STOP_MUST_NOT_EXECUTE');},process:{env:{LUXURY_SERVICE_GUARD:'enabled'},argv:['node','worker','hermes',mode,'all'],exit(code){stopped=code;throw stop;}}});}catch(e){assert.equal(e,stop);}
 assert.equal(stopped,78,'persisted safety stop prevents new execution');
}
for(const legacy of [false,true]){
 const files=new Map();let runs=0,exitCode;const stop=Error('test exit');
 const fakeFs={mkdirSync(){},existsSync(f){return legacy&&f.endsWith('/checkpoint.json');},writeFileSync(f,s){files.set(f,s);},readdirSync(){return ['unit-run'];},readFileSync(f){
  if(files.has(f))return files.get(f);
  if(f.endsWith('/checkpoint.json'))return JSON.stringify({nextOffset:72,complete:true,failed:true});
  if(f.includes('/countries/'))return JSON.stringify({country:'JP',currency:'JPY',entryUrl:'https://www.hermes.com/jp/ja/'});
  if(f.includes('/artifacts/verified/'))return '[]';
  if(f.endsWith('/summary.json'))return JSON.stringify([{status:'NEXT_OFFSET_72'},{status:'REMAINING_0'},{status:'UNPROCESSED_COUNTRY_LISTING'}]);
  throw Error('unexpected file');
 }};
 try{vm.runInNewContext(wrapper,{__dirname:import.meta.dirname,path,fs:fakeFs,spawnSync(f){if(f.endsWith('crawl-output-guard.sh'))return {status:0};runs++;return {status:2};},process:{env:{LUXURY_SERVICE_GUARD:'enabled'},argv:['node','worker','hermes','--prices-country','jp'],exit(code){exitCode=code;throw stop;}}});}catch(e){assert.equal(e,stop);}
 assert.equal(exitCode,1);assert.equal(runs,legacy?0:1);
 assert([...files.entries()].some(([f,s])=>f.endsWith('/summary.json')&&JSON.parse(s).some(r=>r.status==='FOLLOWUP_REQUIRED')));
 if(!legacy){const state=JSON.parse([...files.entries()].find(([f])=>f.endsWith('/checkpoint.json'))[1]);assert.equal(state.complete,false);assert.equal(state.passFinished,true);assert.equal(state.needsFollowup,true);}
}
console.log('PASS: Hermes exact SKU/country safeguards; incomplete pass requires followup without repeating finished routes');
