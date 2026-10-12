export function catalogTargetBatches(codes){
 if(!Array.isArray(codes)||codes.some(code=>typeof code!=='string'||!/^[A-Z0-9]+$/.test(code))||new Set(codes).size!==codes.length)throw Error('INVALID_TARGET_CODES');
 const batches=[];for(let i=0;i<codes.length;i+=500)batches.push(codes.slice(i,i+500));
 return batches;
}
