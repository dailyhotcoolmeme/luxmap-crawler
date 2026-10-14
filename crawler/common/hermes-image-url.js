// Offline URL validation only. A published rendition is NOT proof of an original.
// No network, guessed asset IDs, size substitution, suffix removal or query stripping.
const views = new Map([['front', '1'], ['side', '4'], ['above', '5'], ['back', '6'], ['detail', '7']]);

export function inspectHermesImageUrl(value, expectedCode) {
 if (typeof value !== 'string' || value.length > 500 || /[\s\\]/u.test(value) ||
     typeof expectedCode !== 'string' || !/^H[0-9]{6}[A-Z0-9]{4}$/.test(expectedCode))
  throw Error('HERMES_IMAGE_REFERENCE');
 let url, pathname;
 try { url = new URL(value); pathname = decodeURIComponent(url.pathname); }
 catch { throw Error('HERMES_IMAGE_REFERENCE'); }
 const native=pathname.match(/^\/is\/image\/hermesproduct\/([0-9]{6}[A-Z0-9]{4})_(?:(front|side|above|back|detail)_(?:wm_)?([1-9])|(worn)_([1-9]))$/);
 if(native){
  if(url.origin!=='https://assets.hermes.com'||url.host!=='assets.hermes.com'||url.username||url.password||url.hash||url.href!==value||`H${native[1]}`!==expectedCode)throw Error('HERMES_IMAGE_REFERENCE');
  if(!/^\?size=3000,3000&extend=(?:0,0,0,0|300,300,300,300)&align=0,0$/.test(url.search))throw Error('HERMES_IMAGE_PATH_UNVERIFIED');
  return {url:url.href,variantCode:expectedCode,view:native[2]??native[4],renditionWidth:3000,renditionHeight:3000,nativeAsset:true,originalVerified:false};
 }
 if (url.protocol !== 'https:' || url.host !== 'assets.hermes.com' || url.username || url.password ||
     url.search || url.hash || url.href !== value || !value.startsWith('https://assets.hermes.com/is/image/hermesproduct/') ||
     /%(?:2f|5c|2e)/i.test(value) || pathname.includes('/../')) throw Error('HERMES_IMAGE_REFERENCE');
 const match = pathname.match(/^\/is\/image\/hermesproduct\/[\p{L}\p{N}-]+--([0-9]{6}[A-Z0-9]{4})-(front|side|above|back|detail)-wm-([0-9]+)-0-0-(320|1000)-(320|1000)_g\.jpg$/u);
 if (!match || match[4] !== match[5] || views.get(match[2]) !== match[3]) throw Error('HERMES_IMAGE_PATH_UNVERIFIED');
 if (`H${match[1]}` !== expectedCode) throw Error('HERMES_IMAGE_SKU');
 return {url: url.href, variantCode: expectedCode, view: match[2], renditionWidth: Number(match[4]), renditionHeight: Number(match[5]), originalVerified: false};
}

// Supply exact URLs extracted from the independently checked Korean product source.
// Membership proves publication only; do not feed this result to original-cutout-v1.
export function hermesPublishedImageUrl(value, expectedCode, publishedUrls) {
 const image = inspectHermesImageUrl(value, expectedCode);
 if (!Array.isArray(publishedUrls) || !publishedUrls.includes(value)) throw Error('HERMES_IMAGE_NOT_PUBLISHED');
 return image.url;
}

export function hermesOriginalImageUrl(value, expectedCode, publishedUrls,properties) {
 const published=hermesPublishedImageUrl(value, expectedCode, publishedUrls);
 const image=inspectHermesImageUrl(value,expectedCode);
 if(image.nativeAsset&&properties?.dimensionsVerified===true&&properties.propertiesUrl===hermesImagePropertiesUrl(value,expectedCode,publishedUrls)&&Number.isSafeInteger(properties.width)&&Number.isSafeInteger(properties.height)&&Math.min(properties.width,properties.height)>=200){
  // Preserve the exact URL published by Hermes; its size query does not prove
  // high resolution. The downloader separately checks actual native dimensions.
  return published;
 }
 // A 1000px rendition, Scene7 route or removed transform is not master-asset evidence.
 // Enable original resolution only after source/native-dimension evidence is verified.
 throw Error('HERMES_ORIGINAL_SOURCE_UNVERIFIED');
}

// Metadata request, NOT an image URL or proof of a master. The central runner owns
// network access. Preserve the published identifier byte-for-byte; add only the
// Scene7 properties request command. Never evaluate a script returned by the server.
export function hermesImagePropertiesUrl(value, expectedCode, publishedUrls) {
 const published=hermesPublishedImageUrl(value, expectedCode, publishedUrls);
 if(inspectHermesImageUrl(value,expectedCode).nativeAsset)return published+'&req=props';
 return `${published}?req=props`;
}
