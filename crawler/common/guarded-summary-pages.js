// Partition, never truncate: every record must survive the output guard.
export function summaryPages(rows, {maxBytes=30000,maxRows=100}={}) {
  const pages=[];let page=[];
  for(const row of rows){
    if(Buffer.byteLength(JSON.stringify([row]))>maxBytes)throw Error('SUMMARY_RECORD_TOO_LARGE');
    if(page.length&&(page.length>=maxRows||Buffer.byteLength(JSON.stringify([...page,row]))>maxBytes)){pages.push(page);page=[];}
    page.push(row);
  }
  if(page.length||!pages.length)pages.push(page);
  return pages;
}
