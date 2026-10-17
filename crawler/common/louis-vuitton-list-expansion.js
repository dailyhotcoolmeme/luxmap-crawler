import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {louisVuittonAccess} from './louis-vuitton-product.js';
import {existsSync} from 'node:fs';
import {nextLouisVuittonExpansion} from './louis-vuitton-expansion-plan.js';

export async function expandLouisVuittonList(){
 if(process.env.CRAWL_MODE!=='deterministic-only'||process.env.LUXURY_PIPELINE_GUARD!=='enabled'||process.env.LUXURY_NETWORK_ISOLATED!=='enabled')throw Error('ISOLATED_PIPELINE_REQUIRED');
 const root=path.resolve(import.meta.dirname,'../..'),run=process.env.CRAWL_RUN_DIR,cfg=JSON.parse(await fs.readFile(process.argv[3])),base=root+'/crawler/runs/louis-vuitton/kr';
 if(cfg.country!=='KR'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(process.env.CRAWL_CDP_URL??''))throw Error('EXISTING_SESSION_REQUIRED');
 let source;const sources=[];
 for(const id of (await fs.readdir(base)).sort().reverse()){
  const f=base+'/'+id+'/summary.json';try{if(spawnSync(root+'/scripts/crawl-output-guard.sh',[f],{stdio:'ignore'}).status)continue;
   sources.push({id,time:(await fs.stat(f)).mtimeMs,rows:JSON.parse(await fs.readFile(f))});
  }catch{}
 }
 source=nextLouisVuittonExpansion(sources,url=>existsSync(root+'/crawler/runtime/louis-vuitton-browser/expanded-list-'+createHash('sha256').update(url).digest('hex')+'.json'))?.row;
 if(!source)throw Error('NORMAL_LIST_SOURCE_REQUIRED');
 const rows=[],row=status=>({brand:'louis-vuitton',country:'KR',parentModel:'기존 정상 목록의 브라우저 추가 상품',variantCode:'SOURCE',price:null,currency:'KRW',status,officialUrl:source.officialUrl});
 try{
  const marker=root+'/crawler/runtime/louis-vuitton-browser/expanded-list-'+createHash('sha256').update(source.officialUrl).digest('hex')+'.json';
  const h=await fs.open(marker,'wx',0o600);await h.writeFile(JSON.stringify({run,source:source.officialUrl}));await h.close();
  const browser=await chromium.connectOverCDP(process.env.CRAWL_CDP_URL),context=browser.contexts()[0],page=context?.pages()[0];if(!page)throw Error('EXISTING_PAGE_REQUIRED');
  const cdp=await context.newCDPSession(page);
  if(page.url()!==source.officialUrl){const history=await cdp.send('Page.getNavigationHistory'),entry=history.entries.filter(e=>e.url===source.officialUrl).at(-1);if(!entry)throw Error('NORMAL_LIST_HISTORY_UNAVAILABLE');await cdp.send('Page.navigateToHistoryEntry',{entryId:entry.id});await page.waitForURL(source.officialUrl,{timeout:cfg.navigationTimeoutMs});await page.waitForLoadState('domcontentloaded',{timeout:cfg.navigationTimeoutMs});}
  await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});louisVuittonAccess(await page.content());
  const grid=page.locator('.lv-product-list').first();if(!await grid.count())throw Error('PRIMARY_PRODUCT_LIST_UNAVAILABLE');
  let prior=await grid.locator('.lv-product-card').count(),saved=0;if(!prior)throw Error('PRIMARY_PRODUCT_CARDS_UNAVAILABLE');
  for(let i=0;i<cfg.maxDiscoveryPages;i++){
   const more=grid.getByRole('button',{name:/^(?:더 보기|더 많은 (?:제품|상품)(?: 보기)?|(?:제품|상품) 더 보기|load more|show more)$/i});
   if(await more.count()===1&&await more.isVisible())await more.click({timeout:5000});
   else await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
   try{await page.waitForFunction(n=>document.querySelector('.lv-product-list')?.querySelectorAll('.lv-product-card').length>n,prior,{timeout:8000});}catch{rows.push(row('NO_ADDITIONAL_LIST_ITEMS'));break;}
   if(page.url()!==source.officialUrl)throw Error('LIST_NAVIGATION_SCOPE');const html=await page.content();if(Buffer.byteLength(html)>cfg.maxResponseBytes)throw Error('RESPONSE_LIMIT');louisVuittonAccess(html);
   prior=await grid.locator('.lv-product-card').count();await fs.writeFile(run+'/raw/'+(++saved)+'.source',html,{mode:0o600});rows.push(row('NORMAL_RENDERED_DOCUMENT_SAVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});
  }
  rows.push(row('EXPANDED_LIST_SNAPSHOTS_'+saved));await cdp.detach();
 }catch(e){rows.push(row(e.code==='EEXIST'?'LIST_EXPANSION_ALREADY_ATTEMPTED':/^[A-Z0-9_]{1,40}$/.test(e.message)?e.message:'LIST_EXPANSION_FAILED'));process.exitCode=1;}
 finally{rows.push(row('BROWSER_SESSION_PRESERVED'));await fs.writeFile(run+'/summary.json',JSON.stringify(rows),{mode:0o600});}
 process.exit(process.exitCode??0);
}
