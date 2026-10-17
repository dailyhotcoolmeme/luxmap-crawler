const base=['kr.louisvuitton.com','us.louisvuitton.com','api.louisvuitton.com'];
export function validLouisVuittonRelayHosts(hosts,proof=[]){
 const set=new Set(hosts);if(set.size!==hosts.length||!base.every(h=>set.has(h)))return false;
 if(set.size===3)return true;if(set.size!==4)return false;
 const extra=hosts.find(h=>!base.includes(h)),country=extra?.match(/^(jp|fr|it|es|sg|hk)\.louisvuitton\.com$/)?.[1];if(!country)return false;
 return proof.some(r=>{try{const u=new URL(r.officialUrl);return r.brand==='louis-vuitton'&&r.country===country.toUpperCase()&&/^PUBLISHED_ALTERNATE_SKUS_[1-9]\d*$/.test(r.status)&&u.protocol==='https:'&&u.hostname===extra&&!u.username&&!u.password&&!u.search&&!u.hash;}catch{return false;}});
}
