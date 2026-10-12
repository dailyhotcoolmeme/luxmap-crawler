export function classifyPradaCandidate(row,isBag){
 if(!row.productName)return 'detail_unresolved';
 const categories=(row.officialCategories??[]).map(value=>value.trim().toLowerCase());
 if(categories.some(value=>['clothing','ready-to-wear','shoes','footwear','eyewear','jewelry','jewellery','beauty','fragrances','의류','신발','선글라스','주얼리','향수'].includes(value)))return 'excluded_nonbag';
 if(categories.some(value=>['bags','handbags','가방','핸드백'].includes(value)))return 'bag';
 if(isBag(row.productName))return 'bag';
 if(/(스니커즈|샌들|로퍼|부츠|슬링백|펌프스|뮬|슈즈|재킷|티셔츠|셔츠|스커트|팬츠|드레스|벨트|지갑|카드\s*홀더|백\s*참|키링|선글라스|코트|스웨터|카디건|스웨트|폴로|블라우스|탑|쇼츠|트라우저|레깅스|양말|타이츠|모자|캡|비니|스카프|타이|장갑|넥타이|수영복|브라|슬리퍼|발레리나|브로그|더비|옥스포드|에스파드리유|목걸이|네크리스|귀걸이|이어링|팔찌|브레이슬릿|반지|링|헤어|헤드밴드|키체인|텀블러|물병|향수)/i.test(row.productName))return 'excluded_nonbag';
 return 'classification_pending';
}
export function completenessReport({discovered,stored,decisions=new Map(),discoveryVerified=false}){
 const missing=[],unresolved=[],excluded=[];
 for(const code of new Set(discovered)){
  if(stored.has(code))continue;
  const decision=decisions.get(code);
  if(decision==='bag')missing.push(code);
  else if(decision==='excluded_nonbag')excluded.push(code);
  else unresolved.push(code);
 }
 return {discovered:new Set(discovered).size,missing,unresolved,excluded,complete:discoveryVerified&&missing.length===0&&unresolved.length===0};
}
