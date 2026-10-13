import {referenceCode} from './jewelry-watch-product.js';

// Repairs can only select exact Korean references discovered in a fresh index.
export function selectRepairUrls(index, codes, config, now = Date.now()) {
  const age = now - Date.parse(index.checkedAt);
  if (!Number.isFinite(age) || age < 0 || age > 86400000) throw Error('REFERENCE_INDEX_STALE');
  if (!Array.isArray(codes) || !codes.length || codes.length > config.maxProductsPerRun ||
      codes.some(code => typeof code !== 'string' || !/^[A-Z0-9]+$/.test(code)) ||
      new Set(codes).size !== codes.length) throw Error('REPAIR_CODES_INVALID');
  const selected = codes.map(code => {
    const matches = index.urls.filter(url => {
      const u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password &&
        config.allowedHosts.includes(u.hostname) && u.pathname.startsWith(config.localePrefix) &&
        new RegExp(config.productPathPattern, 'i').test(u.pathname) &&
        referenceCode(url, config.brand)?.replace(/[^a-z0-9]/gi, '').toUpperCase() === code;
    });
    if (matches.length !== 1) throw Error('REPAIR_REFERENCE_MISMATCH');
    return matches[0];
  });
  return selected;
}
