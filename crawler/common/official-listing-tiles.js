import {decodeHtml} from './prada-product.js';
const normalize=v=>String(v??'').replace(/[^a-z0-9]/gi,'').toUpperCase();
export function listingTiles(html,baseUrl,config){
 const source=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const root={tag:'root',attrs:{},children:[]},stack=[root];let count=0;
 const voids=new Set(['img','input','link','meta','br','hr','source','wbr','area','track','embed','param','col']);
 for(const m of source.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>|([^<]+)/gi)){
  if(++count>50000)throw Error('MARKUP_LIMIT');
  if(m[2]){stack.at(-1).children.push(decodeHtml(m[2]));continue;}
  const tag=m[1].toLowerCase();
  if(m[0].startsWith('</')){const index=stack.findLastIndex(n=>n.tag===tag);if(index>0)stack.length=index;continue;}
  const attrs={};for(const a of m[0].replace(/^<[\w:-]+/,'').matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1].toLowerCase()]=decodeHtml(a[2]??a[3]??a[4]??'');
  const node={tag,attrs,children:[]};stack.at(-1).children.push(node);if(!voids.has(tag)&&!m[0].endsWith('/>'))stack.push(node);
 }
 const flat=node=>typeof node==='string'?node:node.children.map(flat).join(' ');
 const nodes=node=>typeof node==='string'?[]:[node,...node.children.flatMap(nodes)];
 const result=new Map();
 function visit(node,excluded=false,withinGrid=false,ancestors=[]){
  if(typeof node==='string')return;
  excluded||= /recommend|recently|related|suggested|cross-sell/i.test(node.attrs.class??'')||['header','nav','footer'].includes(node.tag);
  withinGrid||=/product-grid|search-results|tiles-container|(?:^|\s)l-productgrid(?:\s|$)/i.test(node.attrs.class??'');
  const pid=node.attrs['data-pid']??node.attrs['data-product-id'];
  if(pid&&['div','article','li'].includes(node.tag))config.inspectTileAncestors?.(pid,[...ancestors,{tag:node.tag,class:node.attrs.class??'',id:node.attrs.id??''}]);
  if(!excluded&&(!config.requireListingGrid||withinGrid)&&pid&&['div','article','li'].includes(node.tag)){
   const descendants=nodes(node),code=normalize(pid);
   const links=descendants.filter(n=>n.tag==='a'&&n.attrs.href).map(n=>{try{return {node:n,url:new URL(n.attrs.href,baseUrl)};}catch{return null;}}).filter(Boolean).filter(({url})=>url.protocol==='https:'&&config.allowedHosts.includes(url.hostname)&&url.pathname.startsWith(config.localePrefix)&&normalize(decodeURIComponent(url.pathname).replace(/\.html\/?$/i,'').replace(/\/$/,'' )).endsWith(code));
   const amounts=[...new Set([...flat(node).matchAll(/₩\s*([0-9][0-9,]+)/g)].map(m=>Number(m[1].replaceAll(',',''))).filter(n=>Number.isFinite(n)&&n>0))];
   if(links.length&&(config.readOnlyCandidates===true||amounts.length===1)){
    const nameNode=descendants.find(n=>/pdp-link|product-name|product-title/i.test(n.attrs.class??''));
    const imageNode=descendants.find(n=>n.tag==='img');
    const name=(nameNode?flat(nameNode):links[0].node.attrs.title??imageNode?.attrs.alt??flat(links[0].node)).replace(/\s+/g,' ').trim().replace(/\s+에 대한\s+.*\s+-\s+Image\s+\d+$/i,'');
    if(name&&!/키링|카드\s*홀더|향수|헤어\s*빗|샌들|스니커|벨트|bag\s*charm|keyring/i.test(name)){
     let image=null;for(const raw of [imageNode?.attrs['data-src'],imageNode?.attrs.src])try{const u=new URL(raw,baseUrl);if(u.protocol==='https:'&&raw&&!raw.startsWith('data:')){image=u.href;break;}}catch{}
     const row={sku:pid,url:links[0].url.href,name,price:config.readOnlyCandidates?null:amounts[0],currency:config.currency,image:image?[image]:[],color:null,material:null,width:null,height:null,depth:null,description:null,groupId:null,groupName:null};
     const previous=result.get(code);if(previous&&previous.price!==row.price)throw Error('LISTING_PRICE_CONFLICT');result.set(code,row);
    }
   }
  }
  for(const child of node.children)visit(child,excluded,withinGrid,[...ancestors,{tag:node.tag,class:node.attrs.class??'',id:node.attrs.id??''}]);
 }
 visit(root);return [...result.values()];
}
