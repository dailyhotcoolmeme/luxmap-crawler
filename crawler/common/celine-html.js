import {decodeHtml} from './prada-product.js';
export function celineNodes(html){
 const root={tag:'root',attrs:{},children:[]},stack=[root],all=[];
 const voids=new Set(['img','input','br','hr','meta','link','source','wbr','area']);let count=0;
 const source=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 for(const m of source.matchAll(/<\/?([a-z][\w:-]*)\b[^>]*>|([^<]+)/gi)){
  if(++count>100000)throw Error('MARKUP_LIMIT');
  if(m[2]){stack.at(-1).children.push(decodeHtml(m[2]));continue;}
  const tag=m[1].toLowerCase();if(m[0].startsWith('</')){const i=stack.findLastIndex(n=>n.tag===tag);if(i>0)stack.length=i;continue;}
  const attrs={};for(const a of m[0].replace(/^<[\w:-]+/,'').matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1].toLowerCase()]=decodeHtml(a[2]??a[3]??a[4]??'');
  const node={tag,attrs,children:[],parent:stack.at(-1)};stack.at(-1).children.push(node);all.push(node);if(!voids.has(tag)&&!m[0].endsWith('/>'))stack.push(node);
 }
 return all;
}
export const celineText=node=>(typeof node==='string'?node:node.children.map(celineText).join(' ')).replace(/\s+/g,' ').trim();
