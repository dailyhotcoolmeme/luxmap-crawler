import sharp from 'sharp';

// Numeric rejection only; this does not assert semantic full-product identity.
export async function diorCutoutQuality(bytes) {
 const {data,info}=await sharp(bytes).resize(160,160,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const visible=new Uint8Array(info.width*info.height),solid=new Uint8Array(visible.length);
 let count=0,opaque=0;
 for(let i=0;i<visible.length;i++){const a=data[i*4+3];if(a>16){visible[i]=1;count++;}if(a>220)opaque++;if(a>128)solid[i]=1;}
 let total=0,largest=0;
 const seen=new Uint8Array(solid.length);
 for(let i=0;i<solid.length;i++)if(solid[i]&&!seen[i]){
  const queue=[i];seen[i]=1;let size=0;
  for(let n=0;n<queue.length;n++){const p=queue[n];size++;
   for(const q of [p-info.width,p+info.width,...(p%info.width?[p-1]:[]),...(p%info.width<info.width-1?[p+1]:[])])if(q>=0&&q<solid.length&&solid[q]&&!seen[q]){seen[q]=1;queue.push(q);}
  }total+=size;largest=Math.max(largest,size);
 }
 const solidRatio=count?opaque/count:0,connectedRatio=total?largest/total:0;
 const flags=[];if(!count)flags.push('EMPTY_MASK');if(solidRatio<.35)flags.push('LOW_SOLID_ALPHA');if(connectedRatio<.65)flags.push('MASK_FRAGMENTED');
 return {schema:1,checked:true,passed:flags.length===0,solidRatio,connectedRatio,flags};
}

export function requireDiorIntegratedAttributes(record){
 for(const key of ['materialDisplay','materialOriginal','colorDisplay','colorOriginal','widthMm','heightMm','depthMm']){
  if(key.endsWith('Mm')?!(Number.isFinite(record[key])&&record[key]>0):typeof record[key]!=='string'||!record[key].trim())throw Error('DIOR_INTEGRATED_FIELDS_UNRESOLVED');
 }
 return true;
}
